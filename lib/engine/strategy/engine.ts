// Strategy Engine — core state machine ported from Python bot/engine.py
// Each call to step() mirrors one iteration of the Python _run_loop()
// All state persists in localStorage via the repository layer.

import type {
  ActiveMarket,
  Books,
  EngineSnapshot,
  EngineState as EngineStateType,
  MarketSide,
  MarketState,
  SideLedger,
  VirtualOrder,
} from "../types";
import type { StrategyConfig } from "../schemas";
import { FillSimulator } from "./fill-simulator";
import { RiskEngine } from "./risk-engine";
import {
  addEngineAuditEvent,
  cancelVirtualOrder,
  createEngineRun,
  createVirtualOrder,
  getActiveMarket,
  getCachedBooks,
  getEngineRun,
  getMarketState,
  getOpenOrdersForSide,
  getOpenOrdersForMarket,
  getOrdersForRun,
  getStrategyConfig,
  saveCachedBooks,
  saveMarketState,
  updateEngineRun,
  updateVirtualOrder,
} from "../repositories";

export class StrategyEngine {
  private config: StrategyConfig;
  private fillSim: FillSimulator;
  private risk: RiskEngine;
  private cycleCount = 0;

  constructor(config: StrategyConfig) {
    this.config = config;
    this.fillSim = new FillSimulator(config);
    this.risk = new RiskEngine(config);
  }

  /** Start a new engine run for a vault. */
  start(vaultId: string): EngineSnapshot {
    const existing = getEngineRun(vaultId);
    if (existing) {
      updateEngineRun(vaultId, { status: "stopped", stoppedAt: Date.now() });
    }

    const run = createEngineRun({
      vaultId,
      status: "running",
      currentState: "DISCOVERING_MARKET",
      activeMarketId: null,
      lastHeartbeatAt: Date.now(),
    });

    addEngineAuditEvent(vaultId, {
      type: "ENGINE_STARTED",
      runId: run.id,
      timestamp: Date.now(),
    });

    return this.snapshot(vaultId);
  }

  /** Stop the engine run for a vault. */
  stop(vaultId: string): void {
    const run = getEngineRun(vaultId);
    if (!run) return;

    // Cancel all open orders
    const orders = getOrdersForRun(run.id);
    for (const order of orders) {
      if (order.status === "OPEN" || order.status === "PARTIAL") {
        cancelVirtualOrder(vaultId, order.id);
      }
    }

    updateEngineRun(vaultId, { status: "stopped", stoppedAt: Date.now(), currentState: "IDLE" });

    addEngineAuditEvent(vaultId, {
      type: "ENGINE_STOPPED",
      runId: run.id,
      timestamp: Date.now(),
    });
  }

  /** Main tick — one iteration of the strategy loop. */
  async step(vaultId: string): Promise<EngineSnapshot> {
    const run = getEngineRun(vaultId);
    if (!run || run.status !== "running") return this.snapshot(vaultId);

    const now = Math.floor(Date.now() / 1000);

    try {
      await this.checkMarketRoll(vaultId, now);
      this.checkAndApplyFills(vaultId);
      await this.cancelOppositeBuys(vaultId);
      await this.handleExpiry(vaultId, now);
      await this.placeEntries(vaultId, now);
      await this.ensureSellCoverage(vaultId);
      this.cycleCount++;

      if (this.cycleCount % this.config.reconcileIntervalCycles === 0) {
        this.reconcile(vaultId);
      }

      updateEngineRun(vaultId, { lastHeartbeatAt: Date.now(), currentState: "QUOTING" });
    } catch (err) {
      updateEngineRun(vaultId, {
        status: "error",
        currentState: "ERROR",
        lastError: String(err),
      });
      addEngineAuditEvent(vaultId, {
        type: "ENGINE_ERROR",
        error: String(err),
        timestamp: Date.now(),
      });
    }

    return this.snapshot(vaultId);
  }

  // ── Market Discovery ──

  private async checkMarketRoll(vaultId: string, now: number): Promise<void> {
    const { discoverActiveMarket } = await import("../adapters/polymarket-readonly");
    const detected = await discoverActiveMarket(now);
    if (!detected) return;

    const state = getMarketState(vaultId);
    const currentId = state?.market?.conditionId;
    if (currentId === detected.conditionId) return;

    const previousId = currentId;
    const newState = this.createFreshState(detected);
    if (previousId) newState.pendingOldMarketId = previousId;
    saveMarketState(vaultId, newState);

    // Cancel old buys
    if (previousId) {
      for (const o of getOpenOrdersForMarket(vaultId, previousId, "BUY")) {
        cancelVirtualOrder(vaultId, o.id);
      }
    }

    updateEngineRun(vaultId, {
      currentState: "READY" as EngineStateType,
      activeMarketId: detected.conditionId,
    });

    // Init books
    const books = getCachedBooks(vaultId);
    books[detected.yesTokenId] = { bestBid: null, bestAsk: null };
    books[detected.noTokenId] = { bestBid: null, bestAsk: null };
    saveCachedBooks(vaultId, books);

    addEngineAuditEvent(vaultId, {
      type: "MARKET_ROLLOVER",
      oldMarketId: previousId ?? "none",
      newMarketId: detected.conditionId,
      question: detected.question,
      timestamp: Date.now(),
    });
  }

  // ── Fill Detection ──

  private checkAndApplyFills(vaultId: string): void {
    const run = getEngineRun(vaultId);
    const state = getMarketState(vaultId);
    const books = getCachedBooks(vaultId);
    if (!run || !state) return;

    const trackedOrders = getOrdersForRun(run.id);
    const ordersMap = new Map<string, VirtualOrder>();
    for (const o of trackedOrders) ordersMap.set(o.id, o);

    const now = Math.floor(Date.now() / 1000);
    const fills = this.fillSim.checkFills(books, ordersMap, state, now);

    for (const fill of fills) {
      const order = ordersMap.get(fill.orderId);
      if (!order) continue;

      this.fillSim.applyFill(order, fill.filledQty, state, fill.reason);
      updateVirtualOrder(fill.orderId, {
        filledQty: order.filledQty,
        remainingQty: order.remainingQty,
        status: order.status,
      });
    }

    if (fills.length > 0) {
      saveMarketState(vaultId, state);
      addEngineAuditEvent(vaultId, {
        type: "SIMULATED_FILLS",
        count: fills.length,
        fills: fills.map(f => ({ orderId: f.orderId, qty: f.filledQty, reason: f.reason })),
        timestamp: Date.now(),
      });
    }
  }

  // ── Entry Logic ──

  private async placeEntries(vaultId: string, now: number): Promise<void> {
    const run = getEngineRun(vaultId);
    if (!run) return;
    const state = getMarketState(vaultId);
    if (!state || !state.market) return;

    const toExpiry = state.market.endTs - now;
    if (toExpiry <= this.config.noNewEntriesLastSeconds) return;

    const anyFilled = this.isAnySideFilled(state);
    if (anyFilled && !this.config.allowBothSides) return;

    const books = getCachedBooks(vaultId);

    for (const side of ["YES", "NO"] as const) {
      const ledger = state.sides[side];
      const tokenId = side === "YES" ? state.market.yesTokenId : state.market.noTokenId;

      if (!this.risk.canPlaceEntry(ledger, state, side, this.config)) continue;

      const book = books[tokenId] ?? { bestBid: null, bestAsk: null };
      if (!this.risk.isPassivePrice(book, "BUY", this.config.entryPrice)) continue;

      const clientRef = `btc5m-buy-${side.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      createVirtualOrder({
        engineRunId: run.id,
        marketId: state.market.conditionId,
        side,
        intent: "BUY",
        tokenId,
        price: this.config.entryPrice,
        submittedQty: this.config.orderSize,
        clientRef,
        simulated: true,
      });

      ledger.submittedBuyQty += this.config.orderSize;
      ledger.openBuyQty += this.config.orderSize;
      state.totalNewEntries++;

      addEngineAuditEvent(vaultId, {
        type: "bid-placed",
        side,
        price: this.config.entryPrice,
        qty: this.config.orderSize,
        timestamp: Date.now(),
      });
    }

    saveMarketState(vaultId, state);
  }

  // ── Sell Coverage ──

  private async ensureSellCoverage(vaultId: string): Promise<void> {
    const run = getEngineRun(vaultId);
    const state = getMarketState(vaultId);
    if (!run || !state || !state.market) return;

    const books = getCachedBooks(vaultId);
    const EPSILON = 1e-9;

    for (const side of ["YES", "NO"] as const) {
      const ledger = state.sides[side];
      const tokenId = side === "YES" ? state.market.yesTokenId : state.market.noTokenId;

      // Oversell guard
      if (ledger.openSellQty > ledger.unsoldInventory + EPSILON) {
        for (const o of getOpenOrdersForSide(vaultId, side, "SELL")) {
          cancelVirtualOrder(vaultId, o.id);
          ledger.openSellQty -= o.remainingQty;
        }
        ledger.openSellQty = 0;
        continue;
      }

      const missing = Math.max(0, ledger.unsoldInventory - ledger.openSellQty);
      if (missing < EPSILON) continue;

      const book = books[tokenId] ?? { bestBid: null, bestAsk: null };
      if (!this.risk.isPassivePrice(book, "SELL", this.config.exitPrice)) continue;

      createVirtualOrder({
        engineRunId: run.id,
        marketId: state.market.conditionId,
        side,
        intent: "SELL",
        tokenId,
        price: this.config.exitPrice,
        submittedQty: missing,
        clientRef: `btc5m-sell-${side.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        simulated: true,
      });

      ledger.submittedSellQty += missing;
      ledger.openSellQty += missing;
    }

    saveMarketState(vaultId, state);
  }

  // ── Opposite Side Cancel ──

  private async cancelOppositeBuys(vaultId: string): Promise<void> {
    const state = getMarketState(vaultId);
    if (!state) return;

    const filledSides = new Set<MarketSide>();
    for (const side of ["YES", "NO"] as const) {
      if (state.sides[side].filledBuyQty > 0 || state.sides[side].unsoldInventory > 0) {
        filledSides.add(side);
      }
    }
    if (filledSides.size === 0) return;

    for (const side of ["YES", "NO"] as const) {
      if (filledSides.has(side) || state.sides[side].openBuyQty <= 0) continue;
      for (const o of getOpenOrdersForSide(vaultId, side, "BUY")) {
        cancelVirtualOrder(vaultId, o.id);
        state.sides[side].openBuyQty -= o.remainingQty;
      }
      state.sides[side].openBuyQty = 0;
    }

    saveMarketState(vaultId, state);
  }

  // ── Expiry ──

  private async handleExpiry(vaultId: string, now: number): Promise<void> {
    const state = getMarketState(vaultId);
    if (!state || !state.market) return;

    // Pending old market
    if (state.pendingOldMarketId) {
      const grace = now > state.market.endTs + this.config.keepSellOrdersAfterExpirySeconds;
      if (grace) {
        for (const o of getOpenOrdersForMarket(vaultId, state.pendingOldMarketId, "SELL")) {
          cancelVirtualOrder(vaultId, o.id);
        }
        state.pendingOldMarketId = null;
      }
    }

    const toExpiry = state.market.endTs - now;

    if (toExpiry <= 0 && !state.buyCancelDone) {
      state.isExpired = true;
      for (const side of ["YES", "NO"] as const) {
        for (const o of getOpenOrdersForSide(vaultId, side, "BUY")) {
          cancelVirtualOrder(vaultId, o.id);
          state.sides[side].openBuyQty -= o.remainingQty;
        }
        state.sides[side].openBuyQty = 0;
      }
      state.buyCancelDone = true;
      addEngineAuditEvent(vaultId, { type: "MARKET_EXPIRED", marketId: state.market.conditionId, timestamp: Date.now() });
    }

    if (toExpiry <= -this.config.keepSellOrdersAfterExpirySeconds && !state.sellCancelDone) {
      for (const side of ["YES", "NO"] as const) {
        for (const o of getOpenOrdersForSide(vaultId, side, "SELL")) {
          cancelVirtualOrder(vaultId, o.id);
          state.sides[side].openSellQty -= o.remainingQty;
        }
        state.sides[side].openSellQty = 0;
      }
      state.sellCancelDone = true;
      addEngineAuditEvent(vaultId, { type: "SELL_CANCEL_POST_EXPIRY", marketId: state.market.conditionId, timestamp: Date.now() });
    }

    saveMarketState(vaultId, state);
  }

  // ── Reconciliation ──

  private reconcile(vaultId: string): void {
    const run = getEngineRun(vaultId);
    if (!run) return;
    const state = getMarketState(vaultId);
    if (!state) return;

    const tracked = getOrdersForRun(run.id);

    for (const side of ["YES", "NO"] as const) {
      const ledger = state.sides[side];
      const sideOrders = tracked.filter(o => o.side === side);

      ledger.openBuyQty = sideOrders
        .filter(o => o.intent === "BUY" && (o.status === "OPEN" || o.status === "PARTIAL"))
        .reduce((sum, o) => sum + o.remainingQty, 0);

      ledger.openSellQty = sideOrders
        .filter(o => o.intent === "SELL" && (o.status === "OPEN" || o.status === "PARTIAL"))
        .reduce((sum, o) => sum + o.remainingQty, 0);
    }

    saveMarketState(vaultId, state);
    addEngineAuditEvent(vaultId, { type: "RECONCILIATION", ordersChecked: tracked.length, timestamp: Date.now() });
  }

  // ── Helpers ──

  private isAnySideFilled(state: MarketState): boolean {
    return (["YES", "NO"] as const).some(
      s => state.sides[s].filledBuyQty > 0 || state.sides[s].unsoldInventory > 0,
    );
  }

  private createFreshState(market: ActiveMarket): MarketState {
    const emptyLedger = (): SideLedger => ({
      submittedBuyQty: 0, filledBuyQty: 0, openBuyQty: 0,
      submittedSellQty: 0, filledSellQty: 0, openSellQty: 0,
      unsoldInventory: 0, realizedPnl: 0, completedCycles: 0,
    });
    return {
      market,
      sides: { YES: emptyLedger(), NO: emptyLedger() },
      totalNewEntries: 0,
      isExpired: false,
      buyCancelDone: false,
      sellCancelDone: false,
      pendingOldMarketId: null,
    };
  }

  private snapshot(vaultId: string): EngineSnapshot {
    const state = getMarketState(vaultId);
    const books = getCachedBooks(vaultId);
    const run = getEngineRun(vaultId);

    let orders: Record<string, VirtualOrder> = {};
    if (run) {
      for (const o of getOrdersForRun(run.id)) {
        orders[o.id] = o;
      }
    }

    return {
      activeMarket: state?.market ?? null,
      orders,
      marketState: state,
      books,
      pnl: null,
    };
  }
}

// ── Singleton per vault ──

const engines = new Map<string, StrategyEngine>();

export function getOrCreateEngine(vaultId: string): StrategyEngine {
  const config = getStrategyConfig(vaultId);
  let engine = engines.get(vaultId);
  if (!engine) {
    engine = new StrategyEngine(config);
    engines.set(vaultId, engine);
  }
  return engine;
}
