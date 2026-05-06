// PnL Computation — per-side breakdown from ledger data
// Port of Python StrategyEngine._log_periodic_status() PnL computation

import type { MarketState, Books, PnlSnapshot } from "./types";
import type { StrategyConfig } from "./schemas";
import { getCachedBooks, getEngineRun, getMarketState, getStrategyConfig, savePnlSnapshot } from "./repositories";

export function computeRunPnL(vaultId: string): PnlSnapshot | null {
  const run = getEngineRun(vaultId);
  if (!run) return null;

  const state = getMarketState(vaultId);
  const config = getStrategyConfig(vaultId);
  const books = getCachedBooks(vaultId);
  const market = state?.market;
  if (!state || !config) return null;

  let totalRealizedPnl = 0;
  let totalUnrealizedPnl = 0;
  let totalInventoryCost = 0;
  let totalOpenNotional = 0;
  let totalCompletedCycles = 0;

  const sideBreakdown: Record<string, {
    realizedPnl: number;
    unrealizedPnl: number;
    inventoryCost: number;
    openNotional: number;
    unsoldInventory: number;
  }> = {};

  for (const side of ["YES", "NO"] as const) {
    const ledger = state.sides[side];
    const tokenId = side === "YES" ? market?.yesTokenId : market?.noTokenId;
    const book = tokenId ? books[tokenId] : null;

    const realizedPnl = ledger.realizedPnl;

    let unrealizedPnl = 0;
    const inventoryCost = ledger.unsoldInventory * config.entryPrice;
    if (ledger.unsoldInventory > 0 && book) {
      const midPrice = book.bestBid !== null && book.bestAsk !== null
        ? (book.bestBid + book.bestAsk) / 2
        : book.bestAsk ?? config.exitPrice;
      unrealizedPnl = ledger.unsoldInventory * (midPrice - config.entryPrice);
    }

    const openNotional = ledger.openBuyQty * config.entryPrice + ledger.openSellQty * config.exitPrice;

    totalRealizedPnl += realizedPnl;
    totalUnrealizedPnl += unrealizedPnl;
    totalInventoryCost += inventoryCost;
    totalOpenNotional += openNotional;
    totalCompletedCycles += ledger.completedCycles;

    sideBreakdown[side] = { realizedPnl, unrealizedPnl, inventoryCost, openNotional, unsoldInventory: ledger.unsoldInventory };
  }

  const snapshot: PnlSnapshot = {
    vaultId,
    runId: run.id,
    totalRealizedPnl,
    totalUnrealizedPnl,
    totalPnl: totalRealizedPnl + totalUnrealizedPnl,
    totalInventoryCost,
    totalOpenNotional,
    totalCompletedCycles,
    sideBreakdown,
    computedAt: Date.now(),
  };

  savePnlSnapshot(snapshot);
  return snapshot;
}
