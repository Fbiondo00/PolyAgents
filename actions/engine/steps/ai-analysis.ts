"use step"

// Workflow step: call Vertex AI for trade decision
// Wraps actions/engine/vertex/analyze.ts with MarketContext from engine store

import type { MarketContext, TradeDecision } from "@/types/trade-decision"
import type { Books } from "@/types/engine"
import { getMarketState, getOrders } from "@/actions/engine/store"
import { analyzeMarket } from "@/actions/engine/vertex/analyze"
import { getTopOfBook } from "@/lib/engine/adapters/polymarket-readonly"

export async function aiAnalysis(vaultId: string): Promise<TradeDecision> {
  const state = getMarketState(vaultId)
  if (!state?.market) {
    return { shouldTrade: false, direction: "NONE", confidence: 0, reasoning: "No active market", suggestedSize: 0 }
  }

  const now = Math.floor(Date.now() / 1000)
  const toExpiry = state.market.endTs - now

  console.log(`[ai-analysis] building context`, { vaultId, question: state.market.question, toExpiry })

  // Fetch live books for order book context
  let yesBid: number | null = null
  let yesAsk: number | null = null
  let noBid: number | null = null
  let noAsk: number | null = null

  try {
    const [yesBook, noBook] = await Promise.all([
      getTopOfBook(state.market.yesTokenId),
      getTopOfBook(state.market.noTokenId),
    ])
    yesBid = yesBook.bestBid
    yesAsk = yesBook.bestAsk
    noBid = noBook.bestBid
    noAsk = noBook.bestAsk
    console.log(`[ai-analysis] order books fetched`, { vaultId, yesBid, yesAsk, noBid, noAsk })
  } catch {
    // Use defaults if book fetch fails
  }

  const context: MarketContext = {
    question: state.market.question,
    currentOdds: {
      yes: yesAsk ?? 0.50,
      no: noAsk ?? 0.50,
    },
    timeToExpiry: Math.max(0, toExpiry),
    inventory: {
      upShares: state.sides.YES.unsoldInventory + state.sides.YES.openBuyQty,
      downShares: state.sides.NO.unsoldInventory + state.sides.NO.openBuyQty,
    },
    recentPnl: state.sides.YES.realizedPnl + state.sides.NO.realizedPnl,
    orderBook: {
      yesBid: yesBid ?? 0.49,
      yesAsk: yesAsk ?? 0.51,
      noBid: noBid ?? 0.49,
      noAsk: noAsk ?? 0.51,
    },
  }

  console.log(`[ai-analysis] calling analyzeMarket`, { vaultId })
  const decision = await analyzeMarket(context)
  console.log(`[ai-analysis] decision received`, { vaultId, shouldTrade: decision.shouldTrade, direction: decision.direction, confidence: decision.confidence })
  return decision
}
