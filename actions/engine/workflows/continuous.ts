"use workflow"

// Continuous trading loop with durable sleep
// Runs trading-cycle repeatedly until engine is stopped

import type { CycleResult } from "@/types/workflow"
import type { StrategyConfig } from "@/types/engine-schemas"
import { getRun } from "@/actions/engine/store"
import { tradingCycleWorkflow } from "./trading-cycle"

export async function continuousWorkflow(
  vaultId: string,
  config: StrategyConfig,
  intervalSeconds: number = 5,
): Promise<void> {
  console.log(`[continuous] starting continuous workflow`, { vaultId, intervalSeconds })

  let cycleN = 0

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const run = getRun(vaultId)

    // Stop if engine is no longer running
    if (!run || run.status !== "running") {
      console.log(`[continuous] engine stopped, exiting`, { vaultId })
      return
    }

    // Run one trading cycle
    const result: CycleResult = await tradingCycleWorkflow(vaultId, config)
    cycleN++

    console.log(`[continuous] cycle ${cycleN} result`, { vaultId, status: result.status, fills: result.fills, pnl: result.pnl })

    // Stop on error to allow investigation
    if (result.status === "error") {
      console.warn(`[continuous] error in cycle, stopping`, { vaultId, cycle: cycleN })
      return
    }

    // Durable sleep — suspends workflow without consuming compute
    await sleep(`${intervalSeconds}s`)
  }
}
