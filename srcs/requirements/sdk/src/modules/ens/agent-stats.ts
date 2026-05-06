import { batchSetTextRecords, readTextRecord } from "./subname"

export interface AgentStats {
  flips: number; pnl: number; inventoryUp: number; inventoryDown: number
  mode: "advisory" | "auto"; cycles: number; lastTrade: string; engineState: string
}

export async function updateAgentStats(ensName: string, stats: AgentStats): Promise<string[]> {
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

export async function readAgentStats(ensName: string): Promise<Record<string, string>> {
  const keys = ["policy.commitment", "agent.flips", "agent.pnl", "agent.inventory", "agent.mode", "agent.cycles", "agent.lastTrade", "agent.engineState"]
  const results = await Promise.allSettled(keys.map((key) => readTextRecord(ensName, key).then((value) => ({ key, value }))))
  const record: Record<string, string> = {}
  for (const r of results) { if (r.status === "fulfilled" && r.value.value) { record[r.value.key] = r.value.value } }
  return record
}
