// Server-side engine store — backed by Supabase (replaces in-memory store)

import type {
  EngineRun,
  MarketState,
  VirtualOrder,
  AuditRecord,
} from "@/types/engine";
import type { StrategyConfig } from "@/types/engine-schemas";
import { createServerClient, supabaseQueries as q } from "@polyagents/sdk";
import {
  dbToEngineRun,
  engineRunToDb,
  engineRunPatchToDb,
  dbToMarketState,
  marketStateToDb,
  dbToVirtualOrder,
  virtualOrderToDb,
  virtualOrderPatchToDb,
  dbToStrategyConfig,
  strategyConfigToDb,
  auditRecordToDb,
  dbToAuditRecord,
} from "@/lib/db-mappers";

const client = createServerClient();

// ── Cycle counts (kept in-memory — ephemeral per server instance) ──

const cycleCounts = new Map<string, number>();

// ── EngineRun ──

export async function getRun(vaultId: string): Promise<EngineRun | null> {
  const row = await q.getEngineRun(client, vaultId);
  return row ? dbToEngineRun(row) : null;
}

export async function saveRun(vaultId: string, run: EngineRun): Promise<void> {
  console.log(`[store] saveRun`, { vaultId, runId: run.id, status: run.status });
  try {
    // Try update first
    const updated = await q.updateEngineRun(client, vaultId, engineRunPatchToDb(run));
    if (!updated) {
      await q.insertEngineRun(client, engineRunToDb(run));
    }
  } catch {
    await q.insertEngineRun(client, engineRunToDb(run));
  }
}

// ── MarketState ──

export async function getMarketState(vaultId: string): Promise<MarketState | null> {
  const row = await q.getMarketState(client, vaultId);
  return row ? dbToMarketState(row) : null;
}

export async function saveMarketState(vaultId: string, state: MarketState): Promise<void> {
  console.log(`[store] saveMarketState`, { vaultId });
  await q.upsertMarketState(client, marketStateToDb(vaultId, state));
}

// ── VirtualOrders ──

export async function getOrders(vaultId: string): Promise<Record<string, VirtualOrder>> {
  const run = await getRun(vaultId);
  if (!run) return {};
  const rows = await q.getOrdersForRun(client, run.id);
  const map: Record<string, VirtualOrder> = {};
  for (const row of rows) {
    const order = dbToVirtualOrder(row);
    map[order.id] = order;
  }
  return map;
}

export async function saveOrder(vaultId: string, order: VirtualOrder): Promise<void> {
  console.log(`[store] saveOrder`, { vaultId, orderId: order.id, status: order.status });
  try {
    await q.updateOrder(client, order.id, virtualOrderPatchToDb(order));
  } catch {
    await q.insertOrder(client, virtualOrderToDb(order, vaultId));
  }
}

// ── AuditRecords ──

export async function getAuditEvents(vaultId: string): Promise<AuditRecord[]> {
  const rows = await q.getAuditEvents(client, vaultId, 500);
  return rows.map(dbToAuditRecord);
}

export async function addAuditEvent(vaultId: string, event: AuditRecord): Promise<void> {
  console.log(`[store] addAuditEvent`, { vaultId, eventType: event.type });
  await q.insertAuditEvent(client, auditRecordToDb(vaultId, event));
}

// ── StrategyConfig ──

export async function getStrategyConfig(vaultId: string): Promise<StrategyConfig | null> {
  const row = await q.getStrategyConfig(client, vaultId);
  return row ? dbToStrategyConfig(row) : null;
}

export async function saveStrategyConfig(vaultId: string, config: StrategyConfig): Promise<void> {
  await q.upsertStrategyConfig(client, strategyConfigToDb(vaultId, config));
}

// ── Cycle counts ──

export function getCycleCount(vaultId: string): number {
  return cycleCounts.get(vaultId) ?? 0;
}

export function incrementCycleCount(vaultId: string): void {
  cycleCounts.set(vaultId, (cycleCounts.get(vaultId) ?? 0) + 1);
}
