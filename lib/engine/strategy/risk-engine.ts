// Risk Engine — guards from Python bot/engine.py _maybe_place_entries() and _ensure_sell_coverage()

import type { BookTop, MarketSide, MarketState, SideLedger } from "../types";
import type { StrategyConfig } from "../schemas";

export class RiskEngine {
  constructor(private config: StrategyConfig) {}

  /** All entry checks combined. Returns true if entry is allowed. */
  canPlaceEntry(ledger: SideLedger, state: MarketState, _side: MarketSide, config: StrategyConfig): boolean {
    // Max trades per market
    if (config.maxTradesPolicy === "side") {
      if (ledger.completedCycles >= config.maxTradesPerMarket) return false;
    } else {
      if (state.totalNewEntries >= config.maxTradesPerMarket) return false;
    }

    // Already have open BUYs on this side
    if (ledger.openBuyQty > 0) return false;

    // Have unsold inventory on this side
    if (ledger.unsoldInventory > 0) return false;

    // Capital allocation check
    const committed = ledger.openBuyQty * config.entryPrice + ledger.unsoldInventory * config.entryPrice;
    const nextNotional = config.orderSize * config.entryPrice;
    if (config.maxCapitalUsdc !== undefined && (committed + nextNotional) > config.maxCapitalUsdc) {
      return false;
    }

    return true;
  }

  /** Passive-only check. BUY must be below best_ask. SELL must be above best_bid. */
  isPassivePrice(book: BookTop, intent: "BUY" | "SELL", price: number): boolean {
    if (!this.config.strictPassiveOnly) return true;

    if (intent === "BUY") {
      if (book.bestAsk === null) return true; // No ask → assume passive
      return price < book.bestAsk;
    }
    if (intent === "SELL") {
      if (book.bestBid === null) return false; // No bid → can't sell passively
      return price > book.bestBid;
    }
    return false;
  }

  /** Tick size validation. */
  validateTickSize(price: number, tickSize: number): boolean {
    const steps = Math.round(price / tickSize);
    return Math.abs(steps * tickSize - price) < 1e-9;
  }

  /** Oversell prevention. */
  isOversellSafe(openSellQty: number, unsoldInventory: number): boolean {
    return openSellQty <= unsoldInventory + 1e-9;
  }

  /** Stale market guard. */
  isMarketStale(activeMarket: { endTs: number }, now: number): boolean {
    return now > activeMarket.endTs + 60; // 60s grace
  }
}
