// Engine state repository — fetch-based, backed by Rust engine API

import type {
  Books,
  EngineRun,
  MarketState,
  PnlSnapshot,
  AuditRecord,
} from './types'
import type { StrategyConfig } from './schemas'
import { engine } from '@/lib/engine-api'

const DEFAULT_CONFIG: StrategyConfig = {
  enabled: true,
  entryPrice: 0.20,
  exitPrice: 0.25,
  orderSize: 10,
  maxTradesPerMarket: 1,
  maxTradesPolicy: 'side',
  noNewEntriesLastSeconds: 10,
  keepSellOrdersAfterExpirySeconds: 10,
  reconcileIntervalCycles: 8,
  strictPassiveOnly: true,
  allowBothSides: true,
  cancelOpenBuysOnExpiry: true,
  autoReentryEnabled: false,
}

// ── Config ──

export async function getStrategyConfig(vaultId: string): Promise<StrategyConfig> {
  try {
    return await engine.getConfig(vaultId)
  } catch {
    return DEFAULT_CONFIG
  }
}

export async function saveStrategyConfig(vaultId: string, patch: Partial<StrategyConfig>): Promise<void> {
  const current = await getStrategyConfig(vaultId)
  const merged = { ...current, ...patch }
  await engine.updateConfig(vaultId, merged)
}

// ── Engine Runs ──

export async function getEngineRun(vaultId: string): Promise<EngineRun | null> {
  return engine.getEngineRun(vaultId)
}

export async function getAllRunningRuns(): Promise<EngineRun[]> {
  const { engines } = await engine.activeEngines()
  const runs: EngineRun[] = []
  for (const e of engines) {
    const run = await engine.getEngineRun(e.vault_id)
    if (run) runs.push(run)
  }
  return runs
}

// ── Market State ──

export async function getMarketState(vaultId: string): Promise<MarketState | null> {
  try {
    return await engine.getMarketState(vaultId)
  } catch {
    return null
  }
}

// ── Books Cache ──

export async function getCachedBooks(vaultId: string): Promise<Books> {
  try {
    return await engine.getBooks(vaultId)
  } catch {
    return {}
  }
}

export async function getActiveMarket(vaultId: string): Promise<MarketState['market'] | null> {
  const state = await getMarketState(vaultId)
  return state?.market ?? null
}

// ── PnL Snapshots ──

export async function getPnlSnapshots(vaultId: string, _limit = 50): Promise<PnlSnapshot[]> {
  return engine.getPnl(vaultId)
}

// ── Audit Events ──

export async function getEngineAuditEvents(vaultId: string, _limit = 100): Promise<AuditRecord[]> {
  return engine.getEngineAuditRecords(vaultId)
}
