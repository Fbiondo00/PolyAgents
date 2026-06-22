// Engine domain types — ported from Python bot/types.py

// ── Enums ──

export type MarketSide = "YES" | "NO";
export type OrderIntent = "BUY" | "SELL";
export type OrderStatus = "OPEN" | "PARTIAL" | "FILLED" | "CANCELLED" | "EXPIRED" | "REJECTED";

// Mirrors the Rust EngineState enum (poly-types). SYNCING_MARKET was previously
// listed here but has no Rust variant, so any UI keyed on it was dead code.
export type EngineState =
  | "IDLE"
  | "DISCOVERING_MARKET"
  | "READY"
  | "QUOTING"
  | "HOLDING_INVENTORY"
  | "EXPIRY_GUARD"
  | "ROLLING_OVER"
  | "RECONCILING"
  | "PAUSED"
  | "ERROR";

export type FillReason =
  | "touched_price"
  | "crossed_top_of_book"
  | "expiry_close"
  | "manual_reconcile"
  | "replay_engine";

// ── Domain Entities ──

export interface ActiveMarket {
  conditionId: string;
  slug: string;
  question: string;
  yesTokenId: string;
  noTokenId: string;
  startTs: number;    // unix seconds
  endTs: number;      // unix seconds
  tickSize: number;
  minOrderSize: number;
}

export interface BookTop {
  bestBid: number | null;
  bestAsk: number | null;
}

export interface VirtualOrder {
  id: string;              // uuid
  engineRunId: string;
  marketId: string;
  side: MarketSide;
  intent: OrderIntent;
  tokenId: string;
  price: number;
  submittedQty: number;
  filledQty: number;
  remainingQty: number;
  status: OrderStatus;
  clientRef: string;       // e.g. "btc5m-buy-yes-1712..-a1b2c3d4"
  placedAt: number;        // unix ms
  expiresAt: number | null;
  simulated: boolean;
  rejectionReason: string | null;
}

export interface SideLedger {
  submittedBuyQty: number;
  filledBuyQty: number;
  openBuyQty: number;
  submittedSellQty: number;
  filledSellQty: number;
  openSellQty: number;
  unsoldInventory: number;
  realizedPnl: number;
  completedCycles: number;
}

export interface MarketState {
  market: ActiveMarket;
  sides: Record<MarketSide, SideLedger>;
  totalNewEntries: number;
  isExpired: boolean;
  buyCancelDone: boolean;
  sellCancelDone: boolean;
  pendingOldMarketId: string | null;
}

export interface EngineRun {
  id: string;
  vaultId: string;
  // Mirrors the Rust EngineRunStatus enum (Running/Stopped/Error). The engine
  // never emits "paused", so any UI matching on it was dead code.
  status: "running" | "stopped" | "error";
  currentState: EngineState;
  activeMarketId: string | null;
  startedAt: number;
  stoppedAt: number | null;
  lastHeartbeatAt: number;
  lastError: string | null;
}

export interface PnlSnapshot {
  vaultId: string;
  runId: string;
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  totalPnl: number;
  totalInventoryCost: number;
  totalOpenNotional: number;
  totalCompletedCycles: number;
  sideBreakdown: Record<string, {
    realizedPnl: number;
    unrealizedPnl: number;
    inventoryCost: number;
    openNotional: number;
    unsoldInventory: number;
  }>;
  computedAt: number;
}

export interface AuditRecord {
  type: string;
  timestamp: number;
  [key: string]: string | number | boolean | null | object;
}

// ── Books map: tokenId -> BookTop ──
export type Books = Record<string, BookTop>;

// ── Engine snapshot returned by each cycle ──
export interface EngineSnapshot {
  activeMarket: ActiveMarket | null;
  orders: Record<string, VirtualOrder>;
  marketState: MarketState | null;
  books: Books;
  pnl: PnlSnapshot | null;
}
