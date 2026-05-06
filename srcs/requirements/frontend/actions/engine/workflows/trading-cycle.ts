"use workflow"

// Single trading cycle orchestrator
// Calls each step in sequence: discover → analyze → bet → fills → sell → expiry → reconcile → mirror-arc → log → ens

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
import { logHedera, logEngineStep } from "@/actions/engine/steps/log-hedera"
import { updateEns } from "@/actions/engine/steps/update-ens"
import { mirrorBetToArc, resolveArcMarket, fetchPolymarketOutcome } from "@/actions/engine/steps/mirror-arc"
import { ensurePolygonLiquidity, repatriateProfitsToArc } from "@/actions/engine/steps/ensure-polygon-liquidity"
import { getClobAdapter, isDemoMode, isLiveMode } from "@/lib/engine/adapters/polymarket-clob"
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
  const run = getRun(vaultId)
  if (!run || run.status !== "running") {
    return { success: false, status: "error", fills: 0, pnl: 0, error: "No active engine run" }
  }

  let totalFills = 0
  let decision: CycleResult["decision"]
  let arcMarketId: number | undefined
  // hederaTopicId is client-side only — skip oracle payment if unavailable
  const topicId: string | null = null

  console.log(`[cycle] ═══════════════════════════════════════`)
  console.log(`[cycle] VAULT `, { vaultId })
  console.log(`[cycle] CONFIG`, { entryPrice: config.entryPrice, exitPrice: config.exitPrice, orderSize: config.orderSize, allowBothSides: config.allowBothSides, reconcileIntervalCycles: config.reconcileIntervalCycles })
  console.log(`[cycle] ═══════════════════════════════════════`)

  try {
    // 1. Discover market
    console.log(`[cycle] step 1: discover`)
    const { market } = await discoverMarket(vaultId)
    if (!market) {
      saveRun(vaultId, { ...run, currentState: "DISCOVERING_MARKET", lastHeartbeatAt: Date.now() })
      return { success: false, status: "no_market", fills: 0, pnl: 0 }
    }

    const toExpiry = market.endTs - Math.floor(Date.now() / 1000)
    console.log(`[cycle] → BTC 5-min market`, { question: market.question, endTs: market.endTs, yesTokenId: market.yesTokenId, noTokenId: market.noTokenId, toExpiry: `${toExpiry}s` })

    // 1b. Log market discovery to HCS
    logEngineStep(topicId, vaultId, "MARKET_DISCOVERED", {
      slug: market.slug,
      question: market.question,
      endTs: market.endTs,
      yesTokenId: market.yesTokenId,
      noTokenId: market.noTokenId,
    }).catch(() => {})

    // 2. AI analysis
    console.log(`[cycle] step 2: analyze`)
    decision = await aiAnalysis(vaultId)

    // 2b. Log AI decision to HCS
    logEngineStep(topicId, vaultId, "AI_DECISION", {
      shouldTrade: decision.shouldTrade,
      direction: decision.direction,
      confidence: decision.confidence,
      reasoning: decision.reasoning,
    }).catch(() => {})

    // 3. Pay oracle the exact LLM cost in HBAR
    console.log(`[cycle] step 3: pay-oracle`)
    if (topicId && decision.usage) {
      try {
        const { payForAgentCycle } = await import("@/lib/hedera/agent-payment")
        const receipt = await payForAgentCycle("ai-analysis", vaultId, topicId, decision.usage.costHbar)
        console.log(`[cycle] oracle paid ${receipt.amount} for ${decision.usage.promptTokens + decision.usage.completionTokens} tokens`)
      } catch (err) {
        console.error(`[cycle] oracle payment failed:`, err)
      }
    }

    // 4. Handle expiry (cancel stale orders)
    console.log(`[cycle] step 4: expiry`)
    await handleExpiry(vaultId, config)

    // 4.5. Ensure Polygon liquidity (auto-bridge USDC from Arc if needed)
    // Skipped in simulator mode — no real orders, no bridge needed
    if (isLiveMode()) {
      console.log(`[cycle] step 4.5: ensure-polygon-liquidity`)
      try {
        const liquidity = await ensurePolygonLiquidity(vaultId)
        if (liquidity.bridged) {
          console.log(`[cycle] bridged ${liquidity.bridgeAmount} USDC Arc→Polygon`)
        }
      } catch (bridgeErr) {
        console.warn(`[cycle] bridge step failed (non-blocking):`, bridgeErr)
      }
    } else {
      console.log(`[cycle] step 4.5: skip (simulator mode — no bridge)`)
    }

    // 5. Place bets (if AI approves or in manual mode)
    console.log(`[cycle] step 5: bet`)
    if (decision.shouldTrade || !config.enabled) {
      await placeBets(vaultId, config)
    }

    // 5b. Log orders placed to HCS
    logEngineStep(topicId, vaultId, "ORDERS_PLACED", {
      shouldTrade: decision.shouldTrade,
      direction: decision.direction,
    }).catch(() => {})

    // 6. Check fills
    console.log(`[cycle] step 6: fills`)
    totalFills = await checkFills(vaultId, config)

    // 6b. Log fills detected to HCS
    logEngineStep(topicId, vaultId, "FILLS_DETECTED", {
      fills_count: totalFills,
    }).catch(() => {})

    // 7. Sell coverage for filled inventory
    console.log(`[cycle] step 7: sell`)
    await sellCoverage(vaultId, config)

    // 7b. Log sells placed to HCS
    const sellState = getMarketState(vaultId)
    const yesFilledBuy = sellState?.sides.YES.filledBuyQty ?? 0
    const noFilledBuy = sellState?.sides.NO.filledBuyQty ?? 0
    logEngineStep(topicId, vaultId, "SELLS_PLACED", {
      yes_filled_buy_qty: yesFilledBuy,
      no_filled_buy_qty: noFilledBuy,
    }).catch(() => {})

    // 8. Mirror filled bets to Arc vault (non-blocking, both sides)
    console.log(`[cycle] step 8: mirror-arc`)
    const mirrorState = getMarketState(vaultId)
    if (mirrorState?.arcMarketId && totalFills > 0) {
      arcMarketId = mirrorState.arcMarketId
      const yesNet = mirrorState.sides.YES.filledBuyQty - mirrorState.sides.YES.filledSellQty
      const noNet = mirrorState.sides.NO.filledBuyQty - mirrorState.sides.NO.filledSellQty
      if (yesNet > 0) mirrorBetToArc(vaultId, "YES", yesNet).catch(() => {})
      if (noNet > 0) mirrorBetToArc(vaultId, "NO", noNet).catch(() => {})
    }

    // 8.5 Retry Arc resolution if expired but not yet resolved (Polymarket delay)
    if (mirrorState?.arcMarketId && !mirrorState.arcResolved && mirrorState.isExpired) {
      fetchPolymarketOutcome(mirrorState.market.slug).then(outcome => {
        if (outcome) resolveArcMarket(vaultId, outcome).catch(() => {})
      }).catch(() => {})
    }

    // 9. Reconcile every N cycles
    console.log(`[cycle] step 9: reconcile`)
    const cycleNum = getCycleCount(vaultId) + 1
    if (cycleNum % config.reconcileIntervalCycles === 0) {
      await reconcile(vaultId)
      logEngineStep(topicId, vaultId, "RECONCILIATION", {
        cycle_num: cycleNum,
      }).catch(() => {})
    }

    // 10. Calculate PnL
    console.log(`[cycle] step 10: pnl`)
    const state = getMarketState(vaultId)
    const pnl = state
      ? state.sides.YES.realizedPnl + state.sides.NO.realizedPnl
      : 0
    console.log(`[cycle] cumulative`, { cycleNum, totalPnl: pnl.toFixed(4), totalFills })

    // 10b. Log PnL to HCS
    logEngineStep(topicId, vaultId, "PNL_UPDATE", {
      cycle_num: cycleNum,
      realized_pnl: state?.sides.YES.realizedPnl ?? 0,
      unrealized_pnl: state?.sides.NO.realizedPnl ?? 0,
      total_pnl: pnl,
    }).catch(() => {})

    // 10.5. Repatriate profits: Polygon → Arc (if positive PnL, non-blocking)
    // Skipped in simulator mode — no real orders, no bridge needed
    if (isLiveMode()) {
      console.log(`[cycle] step 10.5: repatriate-profits`)
      if (pnl > 0 && cycleNum % config.reconcileIntervalCycles === 0) {
        repatriateProfitsToArc(vaultId, pnl.toFixed(2)).then(r => {
          if (r.bridged) {
            console.log(`[cycle] repatriated $${r.bridgeAmount} Polygon→Arc`)
          }
        }).catch(() => {})
      }
    } else {
      console.log(`[cycle] step 10.5: skip (simulator mode — no bridge)`)
    }

    // 11. Build activeMarket data for UI
    console.log(`[cycle] step 11: market-data`)
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
        arcMarketId,
        toExpiry: market.endTs - now,
      }
    } catch { /* market data not available */ }

    // 12. Log to Hedera (non-blocking, audit only — payment already done in step 3)
    console.log(`[cycle] step 12: hedera`)
    logHedera(vaultId, topicId, { status: "completed", fills: totalFills, pnl, decision }).catch(() => {})

    // 13. Update ENS stats (non-blocking)
    console.log(`[cycle] step 13: ens`)
    updateEns(vaultId).catch(() => {})

    // Update run state
    saveRun(vaultId, {
      ...run,
      currentState: "QUOTING",
      lastHeartbeatAt: Date.now(),
    })

    console.log(`[cycle] cycle complete`, { vaultId, fills: totalFills, pnl, status: "completed" })
    return { success: true, status: "completed", fills: totalFills, pnl, reasoning: decision?.reasoning, decision, activeMarket }
  } catch (err) {
    console.error(`[cycle] cycle error`, { vaultId, error: String(err) })
    saveRun(vaultId, {
      ...run,
      currentState: "ERROR",
      lastError: String(err),
      lastHeartbeatAt: Date.now(),
    })
    return { success: false, status: "error", fills: totalFills, pnl: 0, error: String(err), decision }
  }
}
