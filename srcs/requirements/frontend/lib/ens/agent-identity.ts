import { batchSetTextRecords, readTextRecord } from "./subname"
import type { HederaContext } from "@/types/hedera"

// ── ENSIP-25 ──
// https://docs.ens.domains/ensip/25
// Text record key: agent-registration[<registry_address>][<agent_id>]
// Value: any non-empty string = positive attestation

/**
 * Build the ENSIP-25 parameterized text record key.
 * Links an ENS name to a Hedera HCS-14 agent identity.
 */
function ensip25Key(hcsTopicId: string): string {
  return `agent-registration[hedera-hcs14][${hcsTopicId}]`
}

/**
 * Register ENSIP-25 verification linking ENS name to HCS-14 agent identity.
 * Also writes agent metadata (ai.* namespace) and standard profile records.
 */
export async function registerAgentENSIP25(
  ensName: string,
  hederaContext: HederaContext
): Promise<string[]> {
  const agentId = hederaContext.agentTopicId
  const uaid = hederaContext.agentUaid

  const records: [string, string][] = [
    // ENSIP-25 verification — value "1" = positive attestation
    [ensip25Key(agentId), "1"],

    // Agent identity metadata (ai.* namespace)
    ["ai.agent.type", "financial-trading-agent"],
    ["ai.agent.name", "PolyAgents Vault"],
    ["ai.agent.version", "1.0.0"],
    [
      "ai.agent.capabilities",
      "market-analysis,bid-placement,risk-management,pnl-reconciliation",
    ],
    ["ai.agent.network", "hedera-testnet"],
    ["ai.agent.status", "active"],

    // Cross-chain link: Hedera HCS-14 UAID
    ["ai.agent.hcs14-uaid", uaid],

    // Standard ENS profile records
    [
      "description",
      "Autonomous AI trading vault on Polymarket — powered by PolyAgents",
    ],
  ]

  return batchSetTextRecords(ensName, records)
}

/**
 * Verify an ENS name against a known HCS-14 agent identity (ENSIP-25).
 * Returns true if the ENS name owner has attested the association.
 */
export async function verifyAgentIdentity(
  ensName: string,
  hcsTopicId: string
): Promise<boolean> {
  const key = ensip25Key(hcsTopicId)
  const value = await readTextRecord(ensName, key)
  return value !== null && value !== ""
}

/**
 * Resolve an agent's full ENS profile.
 * Used by the discovery dashboard to show agent fleet details.
 */
export async function resolveAgentProfile(
  ensName: string
): Promise<Record<string, string>> {
  const keys = [
    "ai.agent.type",
    "ai.agent.name",
    "ai.agent.version",
    "ai.agent.capabilities",
    "ai.agent.network",
    "ai.agent.status",
    "ai.agent.hcs14-uaid",
    "description",
  ]

  const profile: Record<string, string> = {}
  for (const key of keys) {
    const value = await readTextRecord(ensName, key)
    if (value) profile[key] = value
  }

  return profile
}
