"use step"

// Workflow step: place SELL orders for filled inventory via ClobAdapter
// Ported from StrategyEngine.ensureSellCoverage()

import type { VirtualOrder } from "@/types/engine"
import type { StrategyConfig } from "@/types/engine-schemas"
import { RiskEngine } from "@/lib/engine/strategy/risk-engine"
import { getClobAdapter } from "@/lib/engine/adapters/polymarket-clob"
import { getTopOfBook } from "@/lib/engine/adapters/polymarket-readonly"
import {
  getRun,
  getMarketState,
  getOrders,
  saveOrder,
  saveMarketState,
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

export async function sellCoverage(
  vaultId: string,
  config: StrategyConfig = DEFAULT_CONFIG,
): Promise<number> {
  const run = getRun(vaultId)
  const state = getMarketState(vaultId)
  if (!run || !state?.market) return 0

  const risk = new RiskEngine(config)
  const adapter = await getClobAdapter()
  const EPSILON = 1e-9
  let sellsPlaced = 0

  console.log(`[sell-coverage] checking coverage gaps`, { vaultId })

  for (const side of ["YES", "NO"] as const) {
    const ledger = state.sides[side]
    const tokenId = side === "YES" ? state.market.yesTokenId : state.market.noTokenId

    // Oversell guard: cancel excess sell orders
    if (ledger.openSellQty > ledger.unsoldInventory + EPSILON) {
      console.warn(`[sell-coverage] oversell guard: cancelling excess sells for ${side}`)
      const allOrders = getOrders(vaultId)
      for (const o of Object.values(allOrders)) {
        if (
          o.engineRunId === run.id &&
          o.side === side &&
          o.intent === "SELL" &&
          (o.status === "OPEN" || o.status === "PARTIAL")
        ) {
          // Cancel via ClobAdapter if live
          if (adapter.isLive && !o.simulated) {
            await adapter.cancelOrder(o.id)
          }
          o.status = "CANCELLED"
          o.remainingQty = 0
          saveOrder(vaultId, o)
          ledger.openSellQty -= o.remainingQty
        }
      }
      ledger.openSellQty = 0
      continue
    }

    const missing = Math.max(0, ledger.unsoldInventory - ledger.openSellQty)
    if (missing < EPSILON) continue

    console.log(`[sell-coverage] ${side} missing ${missing} shares`)

    // Passive price check
    let book = { bestBid: null as number | null, bestAsk: null as number | null }
    try {
      book = await getTopOfBook(tokenId)
    } catch { /* use nulls */ }

    if (!risk.isPassivePrice(book, "SELL", config.exitPrice)) continue

    // Place SELL order via ClobAdapter
    console.log(`[sell-coverage] placing SELL for ${side}`, { price: config.exitPrice, size: missing })
    let clobOrderId = ""
    try {
      const result = await adapter.placeOrder(tokenId, "SELL", config.exitPrice, missing)
      clobOrderId = result.orderId
    } catch (err) {
      console.warn(`[sell-coverage] CLOB SELL failed for ${side}:`, err)
      continue
    }

    const order: VirtualOrder = {
      id: clobOrderId || `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      engineRunId: run.id,
      marketId: state.market.conditionId,
      side,
      intent: "SELL",
      tokenId,
      price: config.exitPrice,
      submittedQty: missing,
      filledQty: 0,
      remainingQty: missing,
      status: "OPEN",
      clientRef: `btc5m-sell-${side.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      placedAt: Date.now(),
      expiresAt: null,
      simulated: adapter.isLive ? false : true,
      rejectionReason: null,
    }
    saveOrder(vaultId, order)

    ledger.submittedSellQty += missing
    ledger.openSellQty += missing
    sellsPlaced++
  }

  console.log(`[sell-coverage] total sells placed: ${sellsPlaced}`)
  saveMarketState(vaultId, state)
  return sellsPlaced
}
