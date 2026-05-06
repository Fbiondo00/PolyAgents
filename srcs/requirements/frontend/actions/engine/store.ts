import type {
  EngineRun,
  MarketState,
  VirtualOrder,
  AuditRecord,
} from '@/types/engine'
import type { StrategyConfig } from '@/types/engine-schemas'

// ── JSON structure ──

interface EngineStore {
  runs: Record<string, EngineRun>
  marketStates: Record<string, MarketState>
  orders: Record<string, Record<string, VirtualOrder>>
  audits: Record<string, AuditRecord[]>
  configs: Record<string, StrategyConfig>
  cycleCounts: Record<string, number>
}

// In-memory store — works on Vercel (read-only filesystem) and locally
let store: EngineStore = {
  runs: {},
  marketStates: {},
  orders: {},
  audits: {},
  configs: {},
  cycleCounts: {},
}

// ── Read / write ──

function readStore(): EngineStore {
  return store
}

function writeStore(data: EngineStore): void {
  store = data
}

// ── EngineRun ──

export function getRun(vaultId: string): EngineRun | null {
  return readStore().runs[vaultId] ?? null
}

export function saveRun(vaultId: string, run: EngineRun): void {
  console.log(`[store] saveRun`, { vaultId, runId: run.id, status: run.status })
  const store = readStore()
  store.runs[vaultId] = run
  writeStore(store)
}

// ── MarketState ──

export function getMarketState(vaultId: string): MarketState | null {
  return readStore().marketStates[vaultId] ?? null
}

export function saveMarketState(vaultId: string, state: MarketState): void {
  console.log(`[store] saveMarketState`, { vaultId })
  const store = readStore()
  store.marketStates[vaultId] = state
  writeStore(store)
}

// ── VirtualOrders ──

export function getOrders(vaultId: string): Record<string, VirtualOrder> {
  return readStore().orders[vaultId] ?? {}
}

export function saveOrder(vaultId: string, order: VirtualOrder): void {
  console.log(`[store] saveOrder`, { vaultId, orderId: order.id, status: order.status })
  const store = readStore()
  if (!store.orders[vaultId]) store.orders[vaultId] = {}
  store.orders[vaultId][order.id] = order
  writeStore(store)
}

// ── AuditRecords ──

export function getAuditEvents(vaultId: string): AuditRecord[] {
  return readStore().audits[vaultId] ?? []
}

export function addAuditEvent(vaultId: string, event: AuditRecord): void {
  console.log(`[store] addAuditEvent`, { vaultId, eventType: event.type })
  const store = readStore()
  if (!store.audits[vaultId]) store.audits[vaultId] = []
  store.audits[vaultId].push(event)
  writeStore(store)
}

// ── StrategyConfig ──

export function getStrategyConfig(vaultId: string): StrategyConfig | null {
  return readStore().configs[vaultId] ?? null
}

export function saveStrategyConfig(vaultId: string, config: StrategyConfig): void {
  const store = readStore()
  store.configs[vaultId] = config
  writeStore(store)
}

// ── Cycle counts ──

export function getCycleCount(vaultId: string): number {
  return readStore().cycleCounts[vaultId] ?? 0
}
