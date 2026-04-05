"use step"

// Workflow step: check fills — real CLOB or simulated
// Ported from StrategyEngine.checkAndApplyFills()

import type { VirtualOrder, AuditRecord, FillReason, Books } from "@/types/engine"
import type { StrategyConfig } from "@/types/engine-schemas"
import { FillSimulator } from "@/lib/engine/strategy/fill-simulator"
import { getClobAdapter } from "@/lib/engine/adapters/polymarket-clob"
import { getTopOfBook } from "@/lib/engine/adapters/polymarket-readonly"
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
  entryPrice: 0.01,
  exitPrice: 0.02,
  orderSize: 10,
  maxTradesPerMarket: 50,
  maxTradesPolicy: "side",
  noNewEntriesLastSeconds: 10,
  keepSellOrdersAfterExpirySeconds: 10,
  reconcileIntervalCycles: 8,
  strictPassiveOnly: true,
  allowBothSides: true,
  cancelOpenBuysOnExpiry: true,
  autoReentryEnabled: true,
}

export async function checkFills(
  vaultId: string,
  config: StrategyConfig = DEFAULT_CONFIG,
): Promise<number> {
  const run = getRun(vaultId)
  const state = getMarketState(vaultId)
  if (!run || !state) return 0

  const adapter = await getClobAdapter()
  console.log(`[check-fills] checking fills`, { vaultId, mode: adapter.isLive ? "live" : "simulated" })

  // Build books from live data
  const books: Books = {}
  if (state.market) {
    try {
      const [yesBook, noBook] = await Promise.all([
        getTopOfBook(state.market.yesTokenId),
        getTopOfBook(state.market.noTokenId),
      ])
      books[state.market.yesTokenId] = yesBook
      books[state.market.noTokenId] = noBook
    } catch { /* use empty books */ }
  }

  if (adapter.isLive) {
    // Live mode: check real CLOB order status
    const fillCount = await checkLiveFills(vaultId, run.id)
    console.log(`[check-fills] ${fillCount} fills detected`)
    return fillCount
  }

  // Simulated mode: use FillSimulator
  const fillCount = await checkSimulatedFills(vaultId, run.id, books, state, config)
  console.log(`[check-fills] ${fillCount} fills detected`)
  return fillCount
}

async function checkLiveFills(vaultId: string, runId: string): Promise<number> {
  const adapter = await getClobAdapter()
  const allOrders = getOrders(vaultId)
  const state = getMarketState(vaultId)
  if (!state) return 0

  let fillCount = 0

  for (const o of Object.values(allOrders)) {
    if (o.engineRunId !== runId) continue
    if (o.status !== "OPEN" && o.status !== "PARTIAL") continue

    const clobOrder = await adapter.getOrder(o.id)
    if (!clobOrder) continue

    console.log(`[check-fills:live] checking order`, { orderId: o.id })
    if (clobOrder.filledSize > o.filledQty) {
      const newFill = clobOrder.filledSize - o.filledQty
      console.log(`[check-fills:live] fill detected`, { orderId: o.id, newFillQty: newFill })
      o.filledQty = clobOrder.filledSize
      o.remainingQty = o.submittedQty - o.filledQty
      o.status = clobOrder.status === "FILLED" ? "FILLED" : "PARTIAL"
      saveOrder(vaultId, o)

      // Update ledger
      const side = o.side as "YES" | "NO"
      const ledger = state.sides[side]
      if (o.intent === "BUY") {
        ledger.filledBuyQty += newFill
        ledger.openBuyQty -= newFill
        ledger.unsoldInventory += newFill
      } else {
        ledger.filledSellQty += newFill
        ledger.openSellQty -= newFill
        const costBasis = newFill * o.price * 0.01
        const proceeds = newFill * 0.02
        ledger.realizedPnl += proceeds - costBasis
      }

      fillCount++

      addAuditEvent(vaultId, {
        type: "LIVE_FILL",
        orderId: o.id,
        side: o.side,
        intent: o.intent,
        filledQty: newFill,
        price: o.price,
        timestamp: Date.now(),
      })
    }
  }

  if (fillCount > 0) {
    saveMarketState(vaultId, state)
  }

  return fillCount
}

async function checkSimulatedFills(
  vaultId: string,
  runId: string,
  books: Books,
  state: NonNullable<ReturnType<typeof getMarketState>>,
  config: StrategyConfig,
): Promise<number> {
  // Build orders map
  const allOrders = getOrders(vaultId)
  const ordersMap = new Map<string, VirtualOrder>()
  for (const o of Object.values(allOrders)) {
    if (o.engineRunId === runId) ordersMap.set(o.id, o)
  }

  const fillSim = new FillSimulator(config)
  const now = Math.floor(Date.now() / 1000)
  console.log(`[check-fills:sim] running FillSimulator`, { orderCount: ordersMap.size })
  const fills = fillSim.checkFills(books, ordersMap, state, now)

  let fillCount = 0
  for (const fill of fills) {
    const order = ordersMap.get(fill.orderId)
    if (!order) continue

    fillSim.applyFill(order, fill.filledQty, state, fill.reason)
    saveOrder(vaultId, order)
    fillCount++
  }

  console.log(`[check-fills:sim] ${fills.length} simulated fills`)
  if (fills.length > 0) {
    saveMarketState(vaultId, state)
    addAuditEvent(vaultId, {
      type: "SIMULATED_FILLS",
      count: fills.length,
      fills: fills.map(f => ({ orderId: f.orderId, qty: f.filledQty, reason: f.reason })),
      timestamp: Date.now(),
    })
  }

  return fillCount
}
