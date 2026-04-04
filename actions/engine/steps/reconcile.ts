"use step"

// Workflow step: reconcile order state with tracked orders
// Ported from StrategyEngine.reconcile()

import type { AuditRecord } from "@/types/engine"
import { getRun, getMarketState, getOrders, saveMarketState, addAuditEvent } from "@/actions/engine/store"

export async function reconcile(vaultId: string): Promise<number> {
  const run = getRun(vaultId)
  if (!run) return 0
  const state = getMarketState(vaultId)
  if (!state) return 0

  console.log(`[reconcile] starting reconciliation`, { vaultId })

  const allOrders = getOrders(vaultId)
  const tracked = allOrders.filter(o => o.engineRunId === run.id)

  console.log(`[reconcile] ${tracked.length} orders checked`)

  for (const side of ["YES", "NO"] as const) {
    const ledger = state.sides[side]
    const sideOrders = tracked.filter(o => o.side === side)

    // Recalculate open buy qty from tracked orders
    ledger.openBuyQty = sideOrders
      .filter(o => o.intent === "BUY" && (o.status === "OPEN" || o.status === "PARTIAL"))
      .reduce((sum, o) => sum + o.remainingQty, 0)

    // Recalculate open sell qty from tracked orders
    ledger.openSellQty = sideOrders
      .filter(o => o.intent === "SELL" && (o.status === "OPEN" || o.status === "PARTIAL"))
      .reduce((sum, o) => sum + o.remainingQty, 0)
  }

  console.log(`[reconcile] recalculated open qtys`, {
    YES: { openBuyQty: state.sides.YES.openBuyQty, openSellQty: state.sides.YES.openSellQty },
    NO: { openBuyQty: state.sides.NO.openBuyQty, openSellQty: state.sides.NO.openSellQty },
  })

  saveMarketState(vaultId, state)

  addAuditEvent(vaultId, {
    type: "RECONCILIATION",
    ordersChecked: tracked.length,
    timestamp: Date.now(),
  })

  return tracked.length
}
