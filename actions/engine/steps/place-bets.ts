"use step"

// Workflow step: place BUY orders on both sides via ClobAdapter
// Ported from StrategyEngine.placeEntries()

import type { VirtualOrder, AuditRecord, MarketSide } from "@/types/engine"
import type { StrategyConfig } from "@/types/engine-schemas"
import { RiskEngine } from "@/lib/engine/strategy/risk-engine"
import { getClobAdapter } from "@/lib/engine/adapters/polymarket-clob"
import { getTopOfBook } from "@/lib/engine/adapters/polymarket-readonly"
import { getMarketState, getRun, saveOrder, saveMarketState, addAuditEvent } from "@/actions/engine/store"

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

export async function placeBets(
  vaultId: string,
  config: StrategyConfig = DEFAULT_CONFIG,
): Promise<number> {
  const run = getRun(vaultId)
  if (!run) return 0
  const state = getMarketState(vaultId)
  if (!state?.market) return 0

  const now = Math.floor(Date.now() / 1000)
  const toExpiry = state.market.endTs - now

  console.log(`[place-bets] checking conditions`, { vaultId, toExpiry })

  if (toExpiry <= config.noNewEntriesLastSeconds) {
    console.log(`[place-bets] skipping — too close to expiry`, { vaultId, toExpiry, threshold: config.noNewEntriesLastSeconds })
    return 0
  }

  // Check if any side is already filled
  const anyFilled = (["YES", "NO"] as const).some(
    s => state.sides[s].filledBuyQty > 0 || state.sides[s].unsoldInventory > 0,
  )
  if (anyFilled && !config.allowBothSides) return 0

  const risk = new RiskEngine(config)
  const adapter = getClobAdapter()
  let placed = 0

  for (const side of ["YES", "NO"] as const) {
    const ledger = state.sides[side]

    if (!risk.canPlaceEntry(ledger, state, side, config)) continue

    // Fetch book for passive price check
    const tokenId = side === "YES" ? state.market.yesTokenId : state.market.noTokenId
    let book = { bestBid: null as number | null, bestAsk: null as number | null }
    try {
      book = await getTopOfBook(tokenId)
    } catch { /* use nulls */ }

    if (!risk.isPassivePrice(book, "BUY", config.entryPrice)) continue

    // Place order via ClobAdapter (real or simulated)
    let clobOrderId = ""
    try {
      console.log(`[place-bets] placing BUY for ${side}`, { vaultId, price: config.entryPrice, size: config.orderSize })
      const result = await adapter.placeOrder(tokenId, "BUY", config.entryPrice, config.orderSize)
      clobOrderId = result.orderId
    } catch (err) {
      console.warn(`[place-bets] CLOB order failed for ${side}:`, err)
      continue
    }

    const order: VirtualOrder = {
      id: clobOrderId || `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      engineRunId: run.id,
      marketId: state.market.conditionId,
      side,
      intent: "BUY",
      tokenId,
      price: config.entryPrice,
      submittedQty: config.orderSize,
      filledQty: 0,
      remainingQty: config.orderSize,
      status: "OPEN",
      clientRef: `btc5m-buy-${side.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      placedAt: Date.now(),
      expiresAt: null,
      simulated: adapter.isLive ? false : true,
      rejectionReason: null,
    }
    saveOrder(vaultId, order)

    console.log(`[place-bets] order placed`, { vaultId, orderId: order.id, side, isLive: adapter.isLive })

    // Update ledger
    ledger.submittedBuyQty += config.orderSize
    ledger.openBuyQty += config.orderSize
    state.totalNewEntries++
    placed++

    addAuditEvent(vaultId, {
      type: "bid-placed",
      side,
      price: config.entryPrice,
      qty: config.orderSize,
      orderId: order.id,
      isLive: adapter.isLive,
      timestamp: Date.now(),
    })
  }

  // State was mutated in place; persist
  saveMarketState(vaultId, state!)

  console.log(`[place-bets] total placed: ${placed}`, { vaultId })
  return placed
}
