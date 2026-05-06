"use step"

// Workflow step: update agent stats on ENS subname
// Wraps lib/ens/agent-stats.ts

import { getMarketState, getRun } from "@/actions/engine/store"
import { updateAgentStats } from "@/lib/ens/agent-stats"
import { buildEnsName } from "@/lib/ens/subname"

export async function updateEns(vaultId: string): Promise<boolean> {
  const state = getMarketState(vaultId)
  const run = getRun(vaultId)
  const ensName = buildEnsName(vaultId)

  console.log(`[update-ens] updating ENS stats`, { vaultId, ensName })

  // Aggregate stats from engine state
  const yesPnl = state?.sides.YES.realizedPnl ?? 0
  const noPnl = state?.sides.NO.realizedPnl ?? 0
  const totalPnl = yesPnl + noPnl
  const yesInventory = state?.sides.YES.unsoldInventory ?? 0
  const noInventory = state?.sides.NO.unsoldInventory ?? 0
  const totalCycles =
    (state?.sides.YES.completedCycles ?? 0) +
    (state?.sides.NO.completedCycles ?? 0)

  console.log(`[update-ens] stats: flips=${totalCycles}, pnl=$${totalPnl.toFixed(2)}, inventory=UP/${yesInventory} DOWN/${noInventory}`)

  try {
    await updateAgentStats(ensName, {
      flips: totalCycles,
      pnl: totalPnl,
      inventoryUp: yesInventory,
      inventoryDown: noInventory,
      mode: "advisory" as const,
      cycles: totalCycles,
      lastTrade: new Date().toISOString(),
      engineState: run?.currentState ?? "IDLE",
    })
    console.log(`[update-ens] ENS update success`)
    return true
  } catch (err) {
    console.error(`[update-ens] ENS update failed`, err)
    return false
  }
}
