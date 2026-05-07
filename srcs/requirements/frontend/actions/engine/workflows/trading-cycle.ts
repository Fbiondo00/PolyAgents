"use workflow"

// Single trading cycle orchestrator
// Calls each step in sequence: discover → analyze → handle-expiry → bet → fills → sell → reconcile → pnl

import type { CycleResult, ActiveMarketData } from "@/types/workflow"
import type { StrategyConfig } from "@/types/engine-schemas"
import { getRun, saveRun, getMarketState, getCycleCount } from "@/actions/engine/store"
import { discoverMarket } from "@/actions/engine/steps/discover-market"
import { aiAnalysis } from "@/actions/engine/steps/ai-analysis"
import { placeBets } from "@/actions/engine/steps/place-bets"
import { checkFills } from "@/actions/engine/steps/check-fills"
import { sellCoverage } from "@/actions/engine/steps/sell-coverage"
import { handleExpiry } from "@/actions/engine/steps/handle-expiry"
import { reconcile } from "@/actions/engine/steps/reconcile"
import { getClobAdapter } from "@/lib/engine/adapters/polymarket-clob"
import { getTopOfBook } from "@/lib/engine/adapters/polymarket-readonly"

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

export async function tradingCycleWorkflow(
  vaultId: string,
  config: StrategyConfig = DEFAULT_CONFIG,
): Promise<CycleResult> {
  const run = await getRun(vaultId)
  if (!run || run.status !== "running") {
    return { success: false, status: "error", fills: 0, pnl: 0, error: "No active engine run" }
  }

  let totalFills = 0
  let decision: CycleResult["decision"]

  console.log(`[cycle] ═══════════════════════════════════════`)
  console.log(`[cycle] VAULT `, { vaultId })
  console.log(`[cycle] CONFIG`, { entryPrice: config.entryPrice, exitPrice: config.exitPrice, orderSize: config.orderSize, allowBothSides: config.allowBothSides, reconcileIntervalCycles: config.reconcileIntervalCycles })
  console.log(`[cycle] ═══════════════════════════════════════`)

  try {
    // 1. Discover market
    console.log(`[cycle] step 1: discover`)
    const { market } = await discoverMarket(vaultId)
    if (!market) {
      await saveRun(vaultId, { ...run, currentState: "DISCOVERING_MARKET", lastHeartbeatAt: Date.now() })
      return { success: false, status: "no_market", fills: 0, pnl: 0 }
    }

    const toExpiry = market.endTs - Math.floor(Date.now() / 1000)
    console.log(`[cycle] → BTC 5-min market`, { question: market.question, endTs: market.endTs, yesTokenId: market.yesTokenId, noTokenId: market.noTokenId, toExpiry: `${toExpiry}s` })

    // 2. AI analysis
    console.log(`[cycle] step 2: analyze`)
    decision = await aiAnalysis(vaultId)

    // 3. Handle expiry (cancel stale orders)
    console.log(`[cycle] step 3: expiry`)
    await handleExpiry(vaultId, config)

    // 4. Place bets (if AI approves or in manual mode)
    console.log(`[cycle] step 4: bet`)
    if (decision.shouldTrade || !config.enabled) {
      await placeBets(vaultId, config)
    }

    // 5. Check fills
    console.log(`[cycle] step 5: fills`)
    totalFills = await checkFills(vaultId, config)

    // 6. Sell coverage for filled inventory
    console.log(`[cycle] step 6: sell`)
    await sellCoverage(vaultId, config)

    // 7. Reconcile every N cycles
    console.log(`[cycle] step 7: reconcile`)
    const cycleNum = getCycleCount(vaultId) + 1
    if (cycleNum % config.reconcileIntervalCycles === 0) {
      await reconcile(vaultId)
    }

    // 8. Calculate PnL
    console.log(`[cycle] step 8: pnl`)
    const state = await getMarketState(vaultId)
    const pnl = state
      ? state.sides.YES.realizedPnl + state.sides.NO.realizedPnl
      : 0
    console.log(`[cycle] cumulative`, { cycleNum, totalPnl: pnl.toFixed(4), totalFills })

    // 9. Build activeMarket data for UI
    console.log(`[cycle] step 9: market-data`)
    const adapter = await getClobAdapter()
    let activeMarket: ActiveMarketData | undefined

    try {
      const now = Math.floor(Date.now() / 1000)
      const [yesBook, noBook] = await Promise.all([
        getTopOfBook(market.yesTokenId),
        getTopOfBook(market.noTokenId),
      ])

      activeMarket = {
        question: market.question,
        slug: market.slug,
        endTs: market.endTs,
        conditionId: market.conditionId,
        yesTokenId: market.yesTokenId,
        noTokenId: market.noTokenId,
        yesBook,
        noBook,
        isLive: adapter.isLive,
        toExpiry: market.endTs - now,
      }
    } catch { /* market data not available */ }

    // Update run state
    await saveRun(vaultId, {
      ...run,
      currentState: "QUOTING",
      lastHeartbeatAt: Date.now(),
    })

    console.log(`[cycle] cycle complete`, { vaultId, fills: totalFills, pnl, status: "completed" })
    return { success: true, status: "completed", fills: totalFills, pnl, reasoning: decision?.reasoning, decision, activeMarket }
  } catch (err) {
    console.error(`[cycle] cycle error`, { vaultId, error: String(err) })
    await saveRun(vaultId, {
      ...run,
      currentState: "ERROR",
      lastError: String(err),
      lastHeartbeatAt: Date.now(),
    })
    return { success: false, status: "error", fills: totalFills, pnl: 0, error: String(err), decision }
  }
}
