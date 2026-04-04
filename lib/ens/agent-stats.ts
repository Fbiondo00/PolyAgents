import { batchSetTextRecords, readTextRecord } from "./subname"

export interface AgentStats {
  flips: number
  pnl: number
  inventoryUp: number
  inventoryDown: number
  mode: "advisory" | "auto"
  cycles: number
  lastTrade: string
  engineState: string
}

const AGENT_STAT_KEYS = [
  "agent.flips",
  "agent.pnl",
  "agent.inventory",
  "agent.mode",
  "agent.cycles",
  "agent.lastTrade",
  "agent.engineState",
] as const

/**
 * Write live agent stats as ENS text records.
 * Keys use "agent." prefix for namespace clarity.
 */
export async function updateAgentStats(
  ensName: string,
  stats: AgentStats
): Promise<string[]> {
  const records: [string, string][] = [
    ["agent.flips", stats.flips.toString()],
    ["agent.pnl", stats.pnl.toFixed(4)],
    ["agent.inventory", `${stats.inventoryUp}/${stats.inventoryDown}`],
    ["agent.mode", stats.mode],
    ["agent.cycles", stats.cycles.toString()],
    ["agent.lastTrade", stats.lastTrade],
    ["agent.engineState", stats.engineState],
  ]
  return batchSetTextRecords(ensName, records)
}

/**
 * Read agent stats from ENS (for verification dashboard).
 * Also includes policy.commitment if present.
 */
export async function readAgentStats(
  ensName: string
): Promise<Record<string, string>> {
  const keys = ["policy.commitment", ...AGENT_STAT_KEYS]
  const result: Record<string, string> = {}
  for (const key of keys) {
    const value = await readTextRecord(ensName, key)
    if (value) result[key] = value
  }
  return result
}
