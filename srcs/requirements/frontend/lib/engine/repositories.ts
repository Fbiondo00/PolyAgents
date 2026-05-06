// Engine state repository — localStorage for hackathon (no Supabase)

import type {
  ActiveMarket,
  Books,
  EngineRun,
  MarketState,
  MarketSide,
  PnlSnapshot,
  VirtualOrder,
  AuditRecord,
} from "./types";
import type { StrategyConfig } from "./schemas";

const RUNS_KEY = "polyagents.engine.runs";
const ORDERS_KEY = "polyagents.engine.orders";
const STATES_KEY = "polyagents.engine.states";
const PNLS_KEY = "polyagents.engine.pnl";
const AUDITS_KEY = "polyagents.engine.audits";
const BOOKS_KEY = "polyagents.engine.books";
const CONFIGS_KEY = "polyagents.engine.configs";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function loadArr<T>(key: string): T[] {
  if (!isBrowser()) return [];
  try { return JSON.parse(localStorage.getItem(key) ?? "[]"); }
  catch { return []; }
}

function persistArr<T>(key: string, data: T[]): void {
  if (!isBrowser()) return;
  localStorage.setItem(key, JSON.stringify(data));
}

// ── Config ──

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
};

export function getStrategyConfig(vaultId: string): StrategyConfig {
  if (!isBrowser()) return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(`${CONFIGS_KEY}.${vaultId}`);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG;
  } catch { return DEFAULT_CONFIG; }
}

export function saveStrategyConfig(vaultId: string, patch: Partial<StrategyConfig>): void {
  if (!isBrowser()) return;
  const current = getStrategyConfig(vaultId);
  localStorage.setItem(`${CONFIGS_KEY}.${vaultId}`, JSON.stringify({ ...current, ...patch }));
}

// ── Engine Runs ──

export function getEngineRun(vaultId: string): EngineRun | null {
  return loadArr<EngineRun>(RUNS_KEY).find(r => r.vaultId === vaultId && r.status === "running") ?? null;
}

export function getAllRunningRuns(): EngineRun[] {
  return loadArr<EngineRun>(RUNS_KEY).filter(r => r.status === "running");
}

export function createEngineRun(partial: { vaultId: string; status: EngineRun["status"]; currentState: EngineRun["currentState"]; activeMarketId: string | null; lastHeartbeatAt: number }): EngineRun {
  const run: EngineRun = {
    id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...partial,
    startedAt: Date.now(),
    stoppedAt: null,
    lastError: null,
  };
  const runs = loadArr<EngineRun>(RUNS_KEY);
  runs.push(run);
  persistArr(RUNS_KEY, runs);
  return run;
}

export function updateEngineRun(vaultId: string, patch: Partial<EngineRun>): EngineRun | null {
  const runs = loadArr<EngineRun>(RUNS_KEY);
  const idx = runs.findIndex(r => r.vaultId === vaultId && r.status !== "stopped" && r.status !== "error");
  if (idx === -1) return null;
  Object.assign(runs[idx], patch);
  persistArr(RUNS_KEY, runs);
  return runs[idx];
}

// ── Virtual Orders ──

export function getVirtualOrder(orderId: string): VirtualOrder | null {
  return loadArr<VirtualOrder>(ORDERS_KEY).find(o => o.id === orderId) ?? null;
}

export function getOrdersForRun(runId: string): VirtualOrder[] {
  return loadArr<VirtualOrder>(ORDERS_KEY).filter(o => o.engineRunId === runId);
}

export function createVirtualOrder(partial: { engineRunId: string; marketId: string; side: MarketSide; intent: "BUY" | "SELL"; tokenId: string; price: number; submittedQty: number; clientRef: string; simulated: boolean; expiresAt?: number | null }): VirtualOrder {
  const order: VirtualOrder = {
    id: `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...partial,
    filledQty: 0,
    remainingQty: partial.submittedQty,
    status: "OPEN",
    placedAt: Date.now(),
    expiresAt: partial.expiresAt ?? null,
    rejectionReason: null,
  };
  const orders = loadArr<VirtualOrder>(ORDERS_KEY);
  orders.push(order);
  persistArr(ORDERS_KEY, orders);
  return order;
}

export function updateVirtualOrder(orderId: string, patch: Partial<VirtualOrder>): void {
  const orders = loadArr<VirtualOrder>(ORDERS_KEY);
  const idx = orders.findIndex(o => o.id === orderId);
  if (idx !== -1) {
    Object.assign(orders[idx], patch);
    persistArr(ORDERS_KEY, orders);
  }
}

export function getOpenOrdersForSide(vaultId: string, side: MarketSide, intent: "BUY" | "SELL"): VirtualOrder[] {
  const run = getEngineRun(vaultId);
  if (!run) return [];
  return loadArr<VirtualOrder>(ORDERS_KEY).filter(
    o => o.engineRunId === run.id && o.side === side && o.intent === intent && (o.status === "OPEN" || o.status === "PARTIAL")
  );
}

export function getOpenOrdersForMarket(vaultId: string, marketId: string, intent: "BUY" | "SELL"): VirtualOrder[] {
  const run = getEngineRun(vaultId);
  if (!run) return [];
  return loadArr<VirtualOrder>(ORDERS_KEY).filter(
    o => o.engineRunId === run.id && o.marketId === marketId && o.intent === intent && (o.status === "OPEN" || o.status === "PARTIAL")
  );
}

export function cancelVirtualOrder(_vaultId: string, orderId: string): void {
  const orders = loadArr<VirtualOrder>(ORDERS_KEY);
  const idx = orders.findIndex(o => o.id === orderId);
  if (idx !== -1) {
    orders[idx].status = "CANCELLED";
    orders[idx].remainingQty = 0;
    persistArr(ORDERS_KEY, orders);
  }
}

// ── Market State ──

export function getMarketState(vaultId: string): MarketState | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(`${STATES_KEY}.${vaultId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveMarketState(vaultId: string, state: MarketState): void {
  if (!isBrowser()) return;
  localStorage.setItem(`${STATES_KEY}.${vaultId}`, JSON.stringify(state));
}

// ── Books Cache ──

export function getCachedBooks(vaultId: string): Books {
  if (!isBrowser()) return {};
  try {
    const raw = localStorage.getItem(`${BOOKS_KEY}.${vaultId}`);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function saveCachedBooks(vaultId: string, books: Books): void {
  if (!isBrowser()) return;
  localStorage.setItem(`${BOOKS_KEY}.${vaultId}`, JSON.stringify(books));
}

export function getActiveMarket(vaultId: string): ActiveMarket | null {
  return getMarketState(vaultId)?.market ?? null;
}

// ── PnL Snapshots ──

export function savePnlSnapshot(snapshot: PnlSnapshot): void {
  const snaps = loadArr<PnlSnapshot>(PNLS_KEY);
  snaps.push(snapshot);
  const filtered = snaps.filter(s => s.vaultId === snapshot.vaultId).slice(-200);
  const others = snaps.filter(s => s.vaultId !== snapshot.vaultId);
  persistArr(PNLS_KEY, [...others, ...filtered]);
}

export function getPnlSnapshots(vaultId: string, limit = 50): PnlSnapshot[] {
  return loadArr<PnlSnapshot>(PNLS_KEY).filter(s => s.vaultId === vaultId).slice(-limit);
}

// ── Audit Events ──

export function addEngineAuditEvent(vaultId: string, event: AuditRecord): void {
  const key = `${AUDITS_KEY}.${vaultId}`;
  if (!isBrowser()) return;
  try {
    const existing: AuditRecord[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    existing.unshift(event);
    localStorage.setItem(key, JSON.stringify(existing.slice(0, 500)));
  } catch {
    localStorage.setItem(key, JSON.stringify([event]));
  }
}

export function getEngineAuditEvents(vaultId: string, limit = 100): AuditRecord[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(`${AUDITS_KEY}.${vaultId}`);
    return raw ? JSON.parse(raw).slice(0, limit) : [];
  } catch { return []; }
}
