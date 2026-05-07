export type MarketSide = "YES" | "NO";
export type OrderIntent = "BUY" | "SELL";
export type OrderStatus = "OPEN" | "PARTIAL" | "FILLED" | "CANCELLED" | "EXPIRED" | "REJECTED";
export type EngineState =
  | "IDLE"
  | "DISCOVERING_MARKET"
  | "SYNCING_MARKET"
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

export interface ActiveMarket {
  conditionId: string;
  slug: string;
  question: string;
  yesTokenId: string;
  noTokenId: string;
  startTs: number;
  endTs: number;
  tickSize: number;
  minOrderSize: number;
}

export interface BookTop {
  bestBid: number | null;
  bestAsk: number | null;
}

export interface VirtualOrder {
  id: string;
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
  clientRef: string;
  placedAt: number;
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
  arcMarketId: number | null;
  arcResolved: boolean;
  arcClaimed: boolean;
}

export interface EngineRun {
  id: string;
  vaultId: string;
  status: "running" | "stopped" | "paused" | "error";
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

export type Books = Record<string, BookTop>;

export interface EngineSnapshot {
  activeMarket: ActiveMarket | null;
  orders: Record<string, VirtualOrder>;
  marketState: MarketState | null;
  books: Books;
  pnl: PnlSnapshot | null;
}
