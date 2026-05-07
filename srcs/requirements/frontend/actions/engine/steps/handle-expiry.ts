"use step"

// Workflow step: cancel orders on market expiry via ClobAdapter
// Ported from StrategyEngine.handleExpiry()

import type { AuditRecord } from "@/types/engine"
import type { StrategyConfig } from "@/types/engine-schemas"
import { getClobAdapter } from "@/lib/engine/adapters/polymarket-clob"
import {
  getRun,
  getMarketState,
  getOrders,
  saveOrder,
  saveMarketState,
  addAuditEvent,
} from "@/actions/engine/store"

const DEFAULT_CONFIG: StrategyConfig = {
  enabled: true,
  entryPrice: 0.20,
  exitPrice: 0.25,
  orderSize: 10,
  maxTradesPerMarket: 1,
  maxTradesPolicy: "side",
  noNewEntriesLastSeconds: 10,
  keepSellOrdersAfterExpirySeconds: 10,
  reconcileIntervalCycles: 8,
  strictPassiveOnly: true,
  allowBothSides: true,
  cancelOpenBuysOnExpiry: true,
  autoReentryEnabled: false,
}

async function cancelSideOrders(
  vaultId: string,
  runId: string,
  side: string,
  intent: string,
  marketId?: string,
): Promise<void> {
  const adapter = await getClobAdapter()
  const allOrders = await getOrders(vaultId)
  let cancelCount = 0
  for (const o of Object.values(allOrders)) {
    if (
      o.engineRunId === runId &&
      (side === "*" || o.side === side) &&
      o.intent === intent &&
      (o.status === "OPEN" || o.status === "PARTIAL") &&
      (!marketId || o.marketId === marketId)
    ) {
      // Cancel via ClobAdapter if live
      if (adapter.isLive && !o.simulated) {
        try {
          await adapter.cancelOrder(o.id)
        } catch (err) {
          console.warn(`[handle-expiry] Cancel failed for ${o.id}:`, err)
        }
      }
      o.status = "CANCELLED"
      o.remainingQty = 0
      await saveOrder(vaultId, o)
      cancelCount++
    }
  }
  console.log(`[handle-expiry] cancelling ${cancelCount} orders`, { side, intent, marketId })
}

export async function handleExpiry(
  vaultId: string,
  config: StrategyConfig = DEFAULT_CONFIG,
): Promise<boolean> {
  const state = await getMarketState(vaultId)
  if (!state?.market) return false

  const now = Math.floor(Date.now() / 1000)
  const run = await getRun(vaultId)
  if (!run) return false

  let actionTaken = false

  // Pending old market: cancel sell orders after grace period
  if (state.pendingOldMarketId) {
    const grace = now > state.market.endTs + config.keepSellOrdersAfterExpirySeconds
    if (grace) {
      console.log(`[handle-expiry] pending old market grace period expired`)
      await cancelSideOrders(vaultId, run.id, "*", "SELL", state.pendingOldMarketId)
      state.pendingOldMarketId = null
      actionTaken = true
    }
  }

  const toExpiry = state.market.endTs - now
  console.log(`[handle-expiry] checking expiry`, { vaultId, toExpiry })

  // Cancel all buy orders when market expires
  if (toExpiry <= 0 && !state.buyCancelDone) {
    console.log(`[handle-expiry] market expired — cancelling buy orders`)
    state.isExpired = true
    for (const side of ["YES", "NO"] as const) {
      await cancelSideOrders(vaultId, run.id, side, "BUY")
      state.sides[side].openBuyQty = 0
    }
    state.buyCancelDone = true
    await addAuditEvent(vaultId, {
      type: "MARKET_EXPIRED",
      marketId: state.market.conditionId,
      timestamp: Date.now(),
    })

    actionTaken = true
  }

  // Cancel sell orders after grace period
  if (toExpiry <= -config.keepSellOrdersAfterExpirySeconds && !state.sellCancelDone) {
    console.log(`[handle-expiry] cancelling post-expiry sell orders`)
    for (const side of ["YES", "NO"] as const) {
      await cancelSideOrders(vaultId, run.id, side, "SELL")
      state.sides[side].openSellQty = 0
    }
    state.sellCancelDone = true
    await addAuditEvent(vaultId, {
      type: "SELL_CANCEL_POST_EXPIRY",
      marketId: state.market.conditionId,
      timestamp: Date.now(),
    })
    actionTaken = true
  }

  if (actionTaken) await saveMarketState(vaultId, state)
  return actionTaken
}
