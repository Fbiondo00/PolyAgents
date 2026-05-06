/**
 * @polyagents/mcp — MCP Server for PolyAgents SDK
 *
 * Exposes engine operations as composable AI tools.
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
