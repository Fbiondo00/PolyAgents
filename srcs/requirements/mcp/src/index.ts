/**
 * @polyagents/mcp — MCP Server for PolyAgents SDK
 *
 * Exposes engine, hedera, ens, and arc operations as composable AI tools.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import {
  createEngineRun,
  updateEngineRun,
  getEngineRun,
  getMarketState,
  computeRunPnL,
  getOrdersForRun,
  checkHederaConnection,
  initHederaVault,
  payForAgentCycle,
  getAuditLogs,
  createArcWalletClient,
  createMarket,
  placeBet,
  resolveMarket,
  commitPolicyHash,
  verifyPolicyIntegrity,
  readAgentStats,
  initVaultENS,
  getVaultById,
} from "@polyagents/sdk"

const server = new McpServer({
  name: "polyagents",
  version: "0.1.0",
})

// ──────────────────────────────────────────────
// Engine Tools
// ──────────────────────────────────────────────

server.tool("start_engine", "Start a trading engine run for a vault", {
  vaultId: z.string().describe("Vault ID"),
}, async ({ vaultId }) => {
  const run = createEngineRun({
    vaultId,
    status: "running",
    currentState: "IDLE",
    activeMarketId: null,
    lastHeartbeatAt: Date.now(),
  })
  return { content: [{ type: "text", text: JSON.stringify(run, null, 2) }] }
})

server.tool("stop_engine", "Stop a running engine", {
  vaultId: z.string().describe("Vault ID"),
}, async ({ vaultId }) => {
  const run = updateEngineRun(vaultId, { status: "stopped", stoppedAt: Date.now() })
  if (!run) throw new Error(`No running engine for vault ${vaultId}`)
  return { content: [{ type: "text", text: JSON.stringify({ stopped: true, vaultId }, null, 2) }] }
})

server.tool("run_cycle", "Execute a single trading cycle and return PnL", {
  vaultId: z.string().describe("Vault ID"),
}, async ({ vaultId }) => {
  const run = getEngineRun(vaultId)
  if (!run) throw new Error(`No running engine for vault ${vaultId}`)
  const pnl = computeRunPnL(vaultId)
  const cycle = { vaultId, runId: run.id, pnl, timestamp: Date.now() }
  return { content: [{ type: "text", text: JSON.stringify(cycle, null, 2) }] }
})

server.tool("engine_status", "Get engine run status", {
  vaultId: z.string().describe("Vault ID"),
}, async ({ vaultId }) => {
  const run = getEngineRun(vaultId)
  if (!run) return { content: [{ type: "text", text: JSON.stringify({ status: "no_engine" }) }] }
  const pnl = computeRunPnL(vaultId)
  return { content: [{ type: "text", text: JSON.stringify({ ...run, pnl }, null, 2) }] }
})

server.tool("fetch_market", "Fetch active market data for a vault", {
  vaultId: z.string().describe("Vault ID"),
}, async ({ vaultId }) => {
  const state = getMarketState(vaultId)
  return { content: [{ type: "text", text: JSON.stringify(state || { status: "no_active_market" }, null, 2) }] }
})

// ──────────────────────────────────────────────
// Hedera Tools
// ──────────────────────────────────────────────

server.tool("init_vault", "Initialize a new vault with Hedera + ENS", {
  vaultId: z.string().describe("Vault ID"),
  operatorId: z.string().describe("Hedera operator account ID"),
  ownerAddress: z.string().describe("Owner Ethereum address for ENS"),
}, async ({ vaultId, operatorId, ownerAddress }) => {
  const hederaResult = await initHederaVault({ vaultId, operatorId })
  let ensResult = null
  try {
    ensResult = await initVaultENS(vaultId, ownerAddress)
  } catch (e: any) {
    ensResult = { error: e.message }
  }
  return { content: [{ type: "text", text: JSON.stringify({ hedera: hederaResult, ens: ensResult }, null, 2) }] }
})

server.tool("pay_oracle", "Pay HBAR for an agent cycle via Hedera", {
  vaultId: z.string().describe("Vault ID"),
  amount: z.number().describe("HBAR amount"),
  memo: z.string().optional().describe("Payment memo"),
}, async ({ vaultId, amount, memo }) => {
  const receipt = await payForAgentCycle(vaultId, amount, memo || `cycle-${Date.now()}`)
  return { content: [{ type: "text", text: JSON.stringify(receipt, null, 2) }] }
})

server.tool("fetch_audit", "Fetch audit logs from an HCS topic", {
  topicId: z.string().describe("HCS topic ID"),
  limit: z.number().default(50).describe("Max logs to return"),
}, async ({ topicId, limit }) => {
  const logs = await getAuditLogs(topicId, { limit })
  return { content: [{ type: "text", text: JSON.stringify(logs, null, 2) }] }
})

server.tool("hedera_health", "Check Hedera network connection health", {}, async () => {
  const healthy = await checkHederaConnection()
  return { content: [{ type: "text", text: JSON.stringify({ healthy }) }] }
})

// ──────────────────────────────────────────────
// ENS Tools
// ──────────────────────────────────────────────

server.tool("commit_policy", "Commit strategy policy hash to ENS text record", {
  vaultId: z.string().describe("Vault ID"),
  policy: z.record(z.any()).describe("Strategy policy object to commit"),
}, async ({ vaultId, policy }) => {
  const hash = await commitPolicyHash(vaultId, policy)
  return { content: [{ type: "text", text: JSON.stringify({ vaultId, hash }, null, 2) }] }
})

server.tool("verify_policy", "Verify policy integrity against ENS commitment", {
  vaultId: z.string().describe("Vault ID"),
  policy: z.record(z.any()).describe("Current strategy policy to verify"),
}, async ({ vaultId, policy }) => {
  const result = await verifyPolicyIntegrity(vaultId, policy)
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }
})

server.tool("fetch_agent_stats", "Fetch live agent stats from ENS text records", {
  ensName: z.string().describe("Agent ENS name (e.g. vault.polyagents.eth)"),
}, async ({ ensName }) => {
  const stats = await readAgentStats(ensName)
  return { content: [{ type: "text", text: JSON.stringify(stats, null, 2) }] }
})

// ──────────────────────────────────────────────
// Arc Tools
// ──────────────────────────────────────────────

server.tool("create_market", "Create a binary prediction market on Arc", {
  question: z.string().describe("Market question (e.g. 'BTC up in 5 min?')"),
  endTime: z.number().describe("Market end timestamp in ms"),
}, async ({ question, endTime }) => {
  const wallet = createArcWalletClient()
  const result = await createMarket(wallet, { question, endTime })
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }
})

server.tool("place_bet", "Place a bet on an Arc prediction market", {
  marketAddress: z.string().describe("Market contract address"),
  outcome: z.enum(["YES", "NO"]).describe("Bet outcome"),
  amount: z.string().describe("USDC amount in whole units"),
}, async ({ marketAddress, outcome, amount }) => {
  const wallet = createArcWalletClient()
  const result = await placeBet(wallet, marketAddress, outcome as "YES" | "NO", amount)
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }
})

server.tool("resolve_market", "Resolve an Arc prediction market", {
  marketAddress: z.string().describe("Market contract address"),
  winningOutcome: z.enum(["YES", "NO"]).describe("Winning outcome"),
}, async ({ marketAddress, winningOutcome }) => {
  const wallet = createArcWalletClient()
  const result = await resolveMarket(wallet, marketAddress, winningOutcome as "YES" | "NO")
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }
})

// ──────────────────────────────────────────────
// Resources
// ──────────────────────────────────────────────

server.resource(
  "vault://{vaultId}",
  { vaultId: z.string() },
  async ({ vaultId }) => {
    const vault = getVaultById(vaultId)
    if (!vault) throw new Error(`Vault ${vaultId} not found`)
    return {
      contents: [{
        uri: `vault://${vaultId}`,
        mimeType: "application/json",
        text: JSON.stringify(vault, null, 2),
      }],
    }
  }
)

server.resource(
  "market://{vaultId}",
  { vaultId: z.string() },
  async ({ vaultId }) => {
    const state = getMarketState(vaultId)
    const orders = state ? getOrdersForRun(vaultId) : []
    return {
      contents: [{
        uri: `market://${vaultId}`,
        mimeType: "application/json",
        text: JSON.stringify({ market: state, orders }, null, 2),
      }],
    }
  }
)

// ──────────────────────────────────────────────
// Start
// ──────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("[polyagents-mcp] server running on stdio")
}

main().catch((err) => {
  console.error("[polyagents-mcp] fatal:", err)
  process.exit(1)
})
