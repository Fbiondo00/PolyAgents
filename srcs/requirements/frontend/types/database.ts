// Wire types matching Rust serde output (snake_case).
// Used to type-cast engine HTTP API responses before mapping to camelCase app types.

import type { Vault, AuditEvent } from './vault'
import type {
  ActiveMarket,
  Books,
  EngineRun,
  EngineState as EngineStateType,
  MarketSide,
  MarketState,
  PnlSnapshot,
  VirtualOrder,
} from './engine'
import type { StrategyConfig } from './engine-schemas'

// ── Vault ──────────────────────────────────────────────────────────────────

export interface VaultRow {
  id: string
  name: string
  wallet_address: string | null
  strategy: unknown
  funding: unknown
  inventory: unknown
  stats: unknown
  mode: 'auto' | 'advisory'
  token_balance: number
  active_market: unknown
  sparkline: unknown
  created: number
}

export function rowToVault(row: VaultRow): Omit<Vault, 'audit'> {
  return {
    id: row.id,
    name: row.name,
    walletAddress: row.wallet_address ?? undefined,
    created: row.created,
    strategy: row.strategy as Vault['strategy'],
    funding: row.funding as Vault['funding'],
    inventory: row.inventory as Vault['inventory'],
    stats: row.stats as Vault['stats'],
    mode: row.mode,
    tokenBalance: row.token_balance,
    activeMarket: row.active_market as Vault['activeMarket'],
    sparkline: row.sparkline as number[] | undefined,
  }
}

export function vaultToRow(vault: Vault): VaultRow {
  return {
    id: vault.id,
    name: vault.name,
    wallet_address: vault.walletAddress ?? null,
    strategy: vault.strategy,
    funding: vault.funding,
    inventory: vault.inventory,
    stats: vault.stats,
    mode: vault.mode,
    token_balance: vault.tokenBalance,
    active_market: vault.activeMarket ?? null,
    sparkline: vault.sparkline ?? null,
    created: vault.created,
  }
}

// ── AuditEvent ──────────────────────────────────────────────────────────────

export interface AuditEventRow {
  id: number | null
  vault_id: string
  event_type: string
  timestamp: number
  data: Record<string, unknown> | null
}

export function rowToAuditEvent(row: AuditEventRow): AuditEvent {
  const data = row.data ?? {}
  return {
    id: (data.id as string) ?? `evt-${row.id}`,
    type: row.event_type as AuditEvent['type'],
    timestamp: row.timestamp,
    marketId: data.marketId as string | undefined,
    shares: data.shares as number | undefined,
    price: data.price as number | undefined,
    pnl: data.pnl as number | undefined,
    reasoning: data.reasoning as string | undefined,
    txHash: data.txHash as string | undefined,
  }
}

// ── EngineRun ───────────────────────────────────────────────────────────────

export interface EngineRunRow {
  id: string
  vault_id: string
  status: 'running' | 'stopped' | 'error'
  current_state: string
  active_market_id: string | null
  started_at: number
  stopped_at: number | null
  last_heartbeat_at: number
  last_error: string | null
}

export function rowToEngineRun(row: EngineRunRow): EngineRun {
  return {
    id: row.id,
    vaultId: row.vault_id,
    status: row.status,
    currentState: row.current_state as EngineStateType,
    activeMarketId: row.active_market_id,
    startedAt: row.started_at,
    stoppedAt: row.stopped_at,
    lastHeartbeatAt: row.last_heartbeat_at,
    lastError: row.last_error,
  }
}

// ── VirtualOrder ────────────────────────────────────────────────────────────

export interface VirtualOrderRow {
  id: string
  engine_run_id: string
  vault_id: string
  market_id: string
  side: string
  intent: string
  token_id: string
  price: number
  submitted_qty: number
  filled_qty: number
  remaining_qty: number
  status: string
  client_ref: string
  placed_at: number
  expires_at: number | null
  simulated: boolean
  rejection_reason: string | null
}

export function rowToVirtualOrder(row: VirtualOrderRow): VirtualOrder {
  return {
    id: row.id,
    engineRunId: row.engine_run_id,
    marketId: row.market_id,
    side: row.side as MarketSide,
    intent: row.intent as 'BUY' | 'SELL',
    tokenId: row.token_id,
    price: row.price,
    submittedQty: row.submitted_qty,
    filledQty: row.filled_qty,
    remainingQty: row.remaining_qty,
    status: row.status as VirtualOrder['status'],
    clientRef: row.client_ref,
    placedAt: row.placed_at,
    expiresAt: row.expires_at,
    simulated: row.simulated,
    rejectionReason: row.rejection_reason,
  }
}

// ── MarketState ─────────────────────────────────────────────────────────────

export interface MarketStateRow {
  vault_id: string
  market: unknown
  sides: unknown
  total_new_entries: number
  is_expired: boolean
  buy_cancel_done: boolean
  sell_cancel_done: boolean
  pending_old_market_id: string | null
}

export function rowToMarketState(row: MarketStateRow): MarketState {
  return {
    market: row.market as ActiveMarket,
    sides: row.sides as MarketState['sides'],
    totalNewEntries: row.total_new_entries,
    isExpired: row.is_expired,
    buyCancelDone: row.buy_cancel_done,
    sellCancelDone: row.sell_cancel_done,
    pendingOldMarketId: row.pending_old_market_id,
  }
}

// ── PnlSnapshot ─────────────────────────────────────────────────────────────

export interface PnlSnapshotRow {
  id: number | null
  vault_id: string
  run_id: string
  total_realized_pnl: number
  total_unrealized_pnl: number
  total_pnl: number
  total_inventory_cost: number
  total_open_notional: number
  total_completed_cycles: number
  side_breakdown: unknown
  computed_at: number
}

export function rowToPnlSnapshot(row: PnlSnapshotRow): PnlSnapshot {
  return {
    vaultId: row.vault_id,
    runId: row.run_id,
    totalRealizedPnl: row.total_realized_pnl,
    totalUnrealizedPnl: row.total_unrealized_pnl,
    totalPnl: row.total_pnl,
    totalInventoryCost: row.total_inventory_cost,
    totalOpenNotional: row.total_open_notional,
    totalCompletedCycles: row.total_completed_cycles,
    sideBreakdown: row.side_breakdown as PnlSnapshot['sideBreakdown'],
    computedAt: row.computed_at,
  }
}

// ── StrategyConfig ──────────────────────────────────────────────────────────

export interface StrategyConfigRow {
  vault_id: string
  enabled: boolean
  entry_price: number
  exit_price: number
  order_size: number
  max_capital_usdc: number | null
  max_trades_per_market: number
  max_trades_policy: string
  no_new_entries_last_seconds: number
  keep_sell_orders_after_expiry_seconds: number
  reconcile_interval_cycles: number
  min_spread_required: number | null
  strict_passive_only: boolean
  allow_both_sides: boolean
  cancel_open_buys_on_expiry: boolean
  auto_reentry_enabled: boolean
  max_drawdown_usdc: number
}

export function rowToStrategyConfig(row: StrategyConfigRow): StrategyConfig {
  return {
    enabled: row.enabled,
    entryPrice: row.entry_price,
    exitPrice: row.exit_price,
    orderSize: row.order_size,
    maxCapitalUsdc: row.max_capital_usdc ?? undefined,
    maxTradesPerMarket: row.max_trades_per_market,
    maxTradesPolicy: row.max_trades_policy as StrategyConfig['maxTradesPolicy'],
    noNewEntriesLastSeconds: row.no_new_entries_last_seconds,
    keepSellOrdersAfterExpirySeconds: row.keep_sell_orders_after_expiry_seconds,
    reconcileIntervalCycles: row.reconcile_interval_cycles,
    minSpreadRequired: row.min_spread_required ?? undefined,
    strictPassiveOnly: row.strict_passive_only,
    allowBothSides: row.allow_both_sides,
    cancelOpenBuysOnExpiry: row.cancel_open_buys_on_expiry,
    autoReentryEnabled: row.auto_reentry_enabled,
  }
}

export function strategyConfigToRow(vaultId: string, config: StrategyConfig): StrategyConfigRow {
  return {
    vault_id: vaultId,
    enabled: config.enabled,
    entry_price: config.entryPrice,
    exit_price: config.exitPrice,
    order_size: config.orderSize,
    max_capital_usdc: config.maxCapitalUsdc ?? null,
    max_trades_per_market: config.maxTradesPerMarket,
    max_trades_policy: config.maxTradesPolicy,
    no_new_entries_last_seconds: config.noNewEntriesLastSeconds,
    keep_sell_orders_after_expiry_seconds: config.keepSellOrdersAfterExpirySeconds,
    reconcile_interval_cycles: config.reconcileIntervalCycles,
    min_spread_required: config.minSpreadRequired ?? null,
    strict_passive_only: config.strictPassiveOnly,
    allow_both_sides: config.allowBothSides,
    cancel_open_buys_on_expiry: config.cancelOpenBuysOnExpiry,
    auto_reentry_enabled: config.autoReentryEnabled,
    max_drawdown_usdc: 50.0,
  }
}

// ── CachedBooks ─────────────────────────────────────────────────────────────

export interface CachedBooksRow {
  vault_id: string
  books: unknown
  updated_at: number
}

export function rowToBooks(row: CachedBooksRow): Books {
  return row.books as Books
}
