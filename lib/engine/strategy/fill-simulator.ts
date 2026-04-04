// Fill Simulator — deterministic fill detection from book-level data
// Port of engine-proposal.md fill simulation rules + bot/engine.py reconciliation

import type { Books, FillReason, MarketState, VirtualOrder } from "../types";
import type { StrategyConfig } from "../schemas";

export interface FillResult {
  orderId: string;
  filledQty: number;
  reason: FillReason;
}

export class FillSimulator {
  constructor(private config: StrategyConfig) {}

  /**
   * Check if any virtual BUY orders should be simulated as filled
   * based on deterministic book-level rules. Called every tick.
   */
  checkFills(
    books: Books,
    orders: Map<string, VirtualOrder>,
    state: MarketState | null,
    _now: number,
  ): FillResult[] {
    const fills: FillResult[] = [];

    for (const [id, order] of orders) {
      if (order.intent !== "BUY" || order.status !== "OPEN") continue;

      const book = books[order.tokenId];
      if (!book) continue;

      let fillReason: FillReason | null = null;

      // Rule 1: touched_price — best_ask <= our BUY price
      if (book.bestAsk !== null && book.bestAsk <= order.price) {
        fillReason = "touched_price";
      }
      // Rule 2: crossed_top_of_book — best_bid <= our BUY price
      else if (book.bestBid !== null && book.bestBid <= order.price) {
        fillReason = "crossed_top_of_book";
      }

      // Rule 3: expiry_close — market expired and order still open
      if (state?.isExpired && order.status === "OPEN" && !fillReason) {
        fillReason = "expiry_close";
      }

      if (fillReason) {
        fills.push({
          orderId: id,
          filledQty: order.remainingQty,
          reason: fillReason,
        });
      }
    }

    // Also check SELL orders
    for (const [id, order] of orders) {
      if (order.intent !== "SELL" || order.status !== "OPEN") continue;

      const book = books[order.tokenId];
      if (!book) continue;

      // SELL fills when best_bid >= our SELL price
      if (book.bestBid !== null && book.bestBid >= order.price) {
        fills.push({
          orderId: id,
          filledQty: order.remainingQty,
          reason: "touched_price",
        });
      }
    }

    return fills;
  }

  /**
   * Apply a fill to an order and update the market state ledger.
   * Returns the updated order.
   */
  applyFill(
    order: VirtualOrder,
    filledQty: number,
    state: MarketState,
    reason: FillReason,
  ): VirtualOrder {
    const delta = filledQty;
    if (delta <= 0) return order;

    order.filledQty += delta;
    order.remainingQty = Math.max(0, order.submittedQty - order.filledQty);
    order.status = order.remainingQty < 1e-9 ? "FILLED" : "PARTIAL";

    const ledger = state.sides[order.side];

    if (order.intent === "BUY") {
      ledger.filledBuyQty += delta;
      ledger.openBuyQty = Math.max(0, ledger.openBuyQty - delta);
      ledger.unsoldInventory += delta;
    } else {
      // SELL fill
      ledger.filledSellQty += delta;
      ledger.openSellQty = Math.max(0, ledger.openSellQty - delta);
      ledger.unsoldInventory -= delta;
      // Realized PnL: delta * (sellPrice - entryPrice)
      ledger.realizedPnl += delta * (order.price - this.config.entryPrice);
    }

    // Check if cycle completed
    const EPSILON = 1e-9;
    if (ledger.unsoldInventory <= EPSILON && ledger.filledBuyQty > 0 && ledger.filledSellQty > 0) {
      ledger.completedCycles++;
    }

    return order;
  }
}
