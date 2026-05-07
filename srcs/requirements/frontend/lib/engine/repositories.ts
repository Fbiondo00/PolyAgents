// Engine state repository — Supabase-backed persistence

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
import { supabase } from "@/lib/supabase";
import { supabaseQueries as q } from "@polyagents/sdk";
import {
  dbToEngineRun,
  engineRunToDb,
  engineRunPatchToDb,
  dbToVirtualOrder,
  virtualOrderToDb,
  virtualOrderPatchToDb,
  dbToMarketState,
  marketStateToDb,
  dbToPnlSnapshot,
  pnlSnapshotToDb,
  auditRecordToDb,
  dbToAuditRecord,
  dbToStrategyConfig,
  strategyConfigToDb,
  dbToBooks,
  booksToDb,
} from "@/lib/db-mappers";

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

// ── Config ──

export async function getStrategyConfig(vaultId: string): Promise<StrategyConfig> {
  try {
    const row = await q.getStrategyConfig(supabase, vaultId);
    return row ? dbToStrategyConfig(row) : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveStrategyConfig(vaultId: string, patch: Partial<StrategyConfig>): Promise<void> {
  const current = await getStrategyConfig(vaultId);
  const merged = { ...current, ...patch };
  await q.upsertStrategyConfig(supabase, strategyConfigToDb(vaultId, merged));
}

// ── Engine Runs ──

export async function getEngineRun(vaultId: string): Promise<EngineRun | null> {
  const row = await q.getEngineRun(supabase, vaultId);
  return row ? dbToEngineRun(row) : null;
}

export async function getAllRunningRuns(): Promise<EngineRun[]> {
  const rows = await q.getAllRunningRuns(supabase);
  return rows.map(dbToEngineRun);
}

export async function createEngineRun(partial: { vaultId: string; status: EngineRun["status"]; currentState: EngineRun["currentState"]; activeMarketId: string | null; lastHeartbeatAt: number }): Promise<EngineRun> {
  const run: EngineRun = {
    id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...partial,
    startedAt: Date.now(),
    stoppedAt: null,
    lastError: null,
  };
  await q.insertEngineRun(supabase, engineRunToDb(run));
  return run;
}

export async function updateEngineRun(vaultId: string, patch: Partial<EngineRun>): Promise<EngineRun | null> {
  const row = await q.updateEngineRun(supabase, vaultId, engineRunPatchToDb(patch));
  return row ? dbToEngineRun(row) : null;
}

// ── Virtual Orders ──

export async function getVirtualOrder(orderId: string): Promise<VirtualOrder | null> {
  const row = await q.getOrder(supabase, orderId);
  return row ? dbToVirtualOrder(row) : null;
}

export async function getOrdersForRun(runId: string): Promise<VirtualOrder[]> {
  const rows = await q.getOrdersForRun(supabase, runId);
  return rows.map(dbToVirtualOrder);
}

export async function createVirtualOrder(vaultId: string, partial: { engineRunId: string; marketId: string; side: MarketSide; intent: "BUY" | "SELL"; tokenId: string; price: number; submittedQty: number; clientRef: string; simulated: boolean; expiresAt?: number | null }): Promise<VirtualOrder> {
  const order: VirtualOrder = {
    id: `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    engineRunId: partial.engineRunId,
    marketId: partial.marketId,
    side: partial.side,
    intent: partial.intent,
    tokenId: partial.tokenId,
    price: partial.price,
    submittedQty: partial.submittedQty,
    filledQty: 0,
    remainingQty: partial.submittedQty,
    status: "OPEN",
    clientRef: partial.clientRef,
    placedAt: Date.now(),
    expiresAt: partial.expiresAt ?? null,
    simulated: partial.simulated,
    rejectionReason: null,
  };
  await q.insertOrder(supabase, virtualOrderToDb(order, vaultId));
  return order;
}

export async function updateVirtualOrder(orderId: string, patch: Partial<VirtualOrder>): Promise<void> {
  await q.updateOrder(supabase, orderId, virtualOrderPatchToDb(patch));
}

export async function getOpenOrdersForSide(vaultId: string, side: MarketSide, intent: "BUY" | "SELL"): Promise<VirtualOrder[]> {
  const run = await getEngineRun(vaultId);
  if (!run) return [];
  const rows = await q.getOpenOrdersForSide(supabase, run.id, side, intent);
  return rows.map(dbToVirtualOrder);
}

export async function getOpenOrdersForMarket(vaultId: string, marketId: string, intent: "BUY" | "SELL"): Promise<VirtualOrder[]> {
  const run = await getEngineRun(vaultId);
  if (!run) return [];
  const rows = await q.getOpenOrdersForMarket(supabase, run.id, marketId, intent);
  return rows.map(dbToVirtualOrder);
}

export async function cancelVirtualOrder(_vaultId: string, orderId: string): Promise<void> {
  await q.updateOrder(supabase, orderId, { status: "CANCELLED", remaining_qty: 0 });
}

// ── Market State ──

export async function getMarketState(vaultId: string): Promise<MarketState | null> {
  try {
    const row = await q.getMarketState(supabase, vaultId);
    return row ? dbToMarketState(row) : null;
  } catch {
    return null;
  }
}

export async function saveMarketState(vaultId: string, state: MarketState): Promise<void> {
  await q.upsertMarketState(supabase, marketStateToDb(vaultId, state));
}

// ── Books Cache ──

export async function getCachedBooks(vaultId: string): Promise<Books> {
  try {
    const row = await q.getCachedBooks(supabase, vaultId);
    return row ? dbToBooks(row) : {};
  } catch {
    return {};
  }
}

export async function saveCachedBooks(vaultId: string, books: Books): Promise<void> {
  await q.upsertCachedBooks(supabase, booksToDb(vaultId, books));
}

export async function getActiveMarket(vaultId: string): Promise<ActiveMarket | null> {
  const state = await getMarketState(vaultId);
  return state?.market ?? null;
}

// ── PnL Snapshots ──

export async function savePnlSnapshot(snapshot: PnlSnapshot): Promise<void> {
  await q.insertPnlSnapshot(supabase, pnlSnapshotToDb(snapshot));
}

export async function getPnlSnapshots(vaultId: string, limit = 50): Promise<PnlSnapshot[]> {
  const rows = await q.getPnlSnapshots(supabase, vaultId, limit);
  return rows.map(dbToPnlSnapshot);
}

// ── Audit Events ──

export async function addEngineAuditEvent(vaultId: string, event: AuditRecord): Promise<void> {
  await q.insertAuditEvent(supabase, auditRecordToDb(vaultId, event));
}

export async function getEngineAuditEvents(vaultId: string, limit = 100): Promise<AuditRecord[]> {
  const rows = await q.getAuditEvents(supabase, vaultId, limit);
  return rows.map(dbToAuditRecord);
}
