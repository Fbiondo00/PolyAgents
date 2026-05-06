"use step"

// Workflow step: discover the active 5-min BTC market from Polymarket
// Ported from StrategyEngine.checkMarketRoll()

import type { ActiveMarket, MarketState, SideLedger, AuditRecord } from "@/types/engine"
import type { StrategyConfig } from "@/types/engine-schemas"
import { discoverActiveMarket, getTopOfBook } from "@/lib/engine/adapters/polymarket-readonly"
import {
  getMarketState as getState,
  saveMarketState as saveState,
  addAuditEvent,
} from "@/actions/engine/store"

interface DiscoverResult {
  market: ActiveMarket | null
  rollover: boolean
}

function emptyLedger(): SideLedger {
  return {
    submittedBuyQty: 0, filledBuyQty: 0, openBuyQty: 0,
    submittedSellQty: 0, filledSellQty: 0, openSellQty: 0,
    unsoldInventory: 0, realizedPnl: 0, completedCycles: 0,
  }
}

export async function discoverMarket(vaultId: string): Promise<DiscoverResult> {
  console.log(`[discover] checking for active market`, { vaultId })

  const now = Math.floor(Date.now() / 1000)
  const detected = await discoverActiveMarket(now)
  if (!detected) {
    console.log(`[discover] no market found`, { vaultId })
    return { market: null, rollover: false }
  }

  console.log(`[discover] market detected`, { vaultId, question: detected.question, conditionId: detected.conditionId })

  const state = getState(vaultId)
  const currentId = state?.market?.conditionId
  if (currentId === detected.conditionId) return { market: detected, rollover: false }

  const previousId = currentId
  console.log(`[discover] market rollover`, { vaultId, oldMarketId: previousId ?? "none", newMarketId: detected.conditionId })

  const newState: MarketState = {
    market: detected,
    sides: { YES: emptyLedger(), NO: emptyLedger() },
    totalNewEntries: 0,
    isExpired: false,
    buyCancelDone: false,
    sellCancelDone: false,
    pendingOldMarketId: previousId ?? null,
  }
  saveState(vaultId, newState)

  const audit: AuditRecord = {
    type: "MARKET_ROLLOVER",
    oldMarketId: previousId ?? "none",
    newMarketId: detected.conditionId,
    question: detected.question,
    timestamp: Date.now(),
  }
  addAuditEvent(vaultId, audit)

  return { market: detected, rollover: !!previousId }
}
