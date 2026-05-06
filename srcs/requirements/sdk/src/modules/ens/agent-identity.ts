import { batchSetTextRecords, readTextRecord } from "./subname"
import type { HederaContext } from "@polyagents/schema"

function ensip25Key(hcsTopicId: string): string {
  return `agent-registration[hedera-hcs14][${hcsTopicId}]`
}

export async function registerAgentENSIP25(ensName: string, hederaContext: HederaContext): Promise<string[]> {
  const agentId = hederaContext.agentTopicId
  const uaid = hederaContext.agentUaid
  const records: [string, string][] = [
    [ensip25Key(agentId), "1"],
    ["ai.agent.type", "financial-trading-agent"],
    ["ai.agent.name", "PolyAgents Vault"],
    ["ai.agent.version", "1.0.0"],
    ["ai.agent.capabilities", "market-analysis,bid-placement,risk-management,pnl-reconciliation"],
    ["ai.agent.network", "hedera-testnet"],
    ["ai.agent.status", "active"],
    ["ai.agent.hcs14-uaid", uaid],
    ["description", "Autonomous AI trading vault on Polymarket — powered by PolyAgents"],
  ]
  return batchSetTextRecords(ensName, records)
}

export async function verifyAgentIdentity(ensName: string, hcsTopicId: string): Promise<boolean> {
  const value = await readTextRecord(ensName, ensip25Key(hcsTopicId))
  return value !== null && value !== ""
}

export async function resolveAgentProfile(ensName: string): Promise<Record<string, string>> {
  const keys = ["ai.agent.type", "ai.agent.name", "ai.agent.version", "ai.agent.capabilities", "ai.agent.network", "ai.agent.status", "ai.agent.hcs14-uaid", "description"]
  const profile: Record<string, string> = {}
  for (const key of keys) { const value = await readTextRecord(ensName, key); if (value) profile[key] = value }
  return profile
}
