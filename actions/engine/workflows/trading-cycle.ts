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
import { logHedera } from "@/actions/engine/steps/log-hedera"
import { updateEns } from "@/actions/engine/steps/update-ens"
import { mirrorBetToArc } from "@/actions/engine/steps/mirror-arc"
import { getClobAdapter } from "@/lib/engine/adapters/polymarket-clob"
import { getTopOfBook } from "@/lib/engine/adapters/polymarket-readonly"

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

  console.log(`[cycle] starting trading cycle`, { vaultId })

  try {
    // 1. Discover market
    console.log(`[cycle] step 1: discover`)
    const { market } = await discoverMarket(vaultId)
    if (!market) {
      saveRun(vaultId, { ...run, currentState: "DISCOVERING_MARKET", lastHeartbeatAt: Date.now() })
      return { success: false, status: "no_market", fills: 0, pnl: 0 }
    }

    // 2. AI analysis
    console.log(`[cycle] step 2: analyze`)
    decision = await aiAnalysis(vaultId)

    // 3. Pay oracle the exact LLM cost in HBAR
    console.log(`[cycle] step 3: pay-oracle`)
    const topicId = run.activeMarketId ?? null
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

    // 5. Place bets (if AI approves or in manual mode)
    console.log(`[cycle] step 5: bet`)
    if (decision.shouldTrade || !config.enabled) {
      await placeBets(vaultId, config)
    }

    // 6. Check fills
    console.log(`[cycle] step 6: fills`)
    totalFills = await checkFills(vaultId, config)

    // 7. Sell coverage for filled inventory
    console.log(`[cycle] step 7: sell`)
    await sellCoverage(vaultId, config)

    // 8. Mirror filled bets to Arc vault (non-blocking)
    console.log(`[cycle] step 8: mirror-arc`)
    if (totalFills > 0) {
      mirrorBetToArc(vaultId, "YES", totalFills).then(r => {
        if (r.success) arcMarketId = r.arcMarketId
      }).catch(() => {})
    }

    // 9. Reconcile every N cycles
    console.log(`[cycle] step 9: reconcile`)
    const cycleNum = getCycleCount(vaultId) + 1
    if (cycleNum % config.reconcileIntervalCycles === 0) {
      await reconcile(vaultId)
    }

    // 10. Calculate PnL
    console.log(`[cycle] step 10: pnl`)
    const state = getMarketState(vaultId)
    const pnl = state
      ? state.sides.YES.realizedPnl + state.sides.NO.realizedPnl
      : 0

    // 11. Build activeMarket data for UI
    console.log(`[cycle] step 11: market-data`)
    const adapter = getClobAdapter()
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
