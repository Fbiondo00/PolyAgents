import type { Json, Tables, TablesInsert, TablesUpdate } from "@polyagents/sdk";
import type { Vault, AuditEvent } from "@/types";
import type {
  EngineRun,
  VirtualOrder,
  MarketState,
  MarketSide,
  PnlSnapshot,
  Books,
  AuditRecord,
} from "@/types/engine";
import type { StrategyConfig } from "@/types/engine-schemas";

function j<T>(v: T): Json {
  return v as unknown as Json;
}

function jn<T>(v: T | null | undefined): Json | null {
  return v == null ? null : v as unknown as Json;
}

// ── Vault ──────────────────────────────────────────────────────────────────

export function dbToVault(row: Tables<"vaults">): Omit<Vault, "audit"> {
  return {
    id: row.id,
    name: row.name,
    walletAddress: (row.wallet_address as string) ?? undefined,
    created: row.created,
    strategy: row.strategy as Vault["strategy"],
    funding: row.funding as Vault["funding"],
    inventory: row.inventory as Vault["inventory"],
    stats: row.stats as Vault["stats"],
    mode: row.mode as Vault["mode"],
    tokenBalance: row.token_balance,
    activeMarket: row.active_market as Vault["activeMarket"],
    sparkline: row.sparkline as number[] | undefined,
  };
}

export function vaultToDb(vault: Vault): TablesInsert<"vaults"> {
  return {
    id: vault.id,
    name: vault.name,
    wallet_address: vault.walletAddress ?? null,
    strategy: j(vault.strategy),
    funding: j(vault.funding),
    inventory: j(vault.inventory),
    stats: j(vault.stats),
    mode: vault.mode,
    token_balance: vault.tokenBalance,
    active_market: jn(vault.activeMarket),
    sparkline: jn(vault.sparkline),
    created: vault.created,
  };
}

export function vaultPatchToDb(vault: Partial<Vault>): TablesUpdate<"vaults"> {
  const patch: TablesUpdate<"vaults"> = {};
  if (vault.name !== undefined) patch.name = vault.name;
  if (vault.walletAddress !== undefined) patch.wallet_address = vault.walletAddress;
  if (vault.strategy !== undefined) patch.strategy = j(vault.strategy);
  if (vault.funding !== undefined) patch.funding = j(vault.funding);
  if (vault.inventory !== undefined) patch.inventory = j(vault.inventory);
  if (vault.stats !== undefined) patch.stats = j(vault.stats);
  if (vault.mode !== undefined) patch.mode = vault.mode;
  if (vault.tokenBalance !== undefined) patch.token_balance = vault.tokenBalance;
  if (vault.activeMarket !== undefined) patch.active_market = jn(vault.activeMarket);
  if (vault.sparkline !== undefined) patch.sparkline = jn(vault.sparkline);
  return patch;
}

// ── Audit Events ───────────────────────────────────────────────────────────

export function auditEventToDb(vaultId: string, event: AuditEvent): TablesInsert<"audit_events"> {
  return {
    vault_id: vaultId,
    type: event.type,
    timestamp: event.timestamp,
    data: {
      id: event.id,
      marketId: event.marketId,
      shares: event.shares,
      price: event.price,
      pnl: event.pnl,
      reasoning: event.reasoning,
      txHash: event.txHash,
    },
  };
}

export function dbToAuditEvent(row: Tables<"audit_events">): AuditEvent {
  const data = (row.data ?? {}) as Record<string, unknown>;
  return {
    id: (data.id as string) ?? `evt-${row.id}`,
    type: row.type as AuditEvent["type"],
    timestamp: row.timestamp,
    marketId: data.marketId as string | undefined,
    shares: data.shares as number | undefined,
    price: data.price as number | undefined,
    pnl: data.pnl as number | undefined,
    reasoning: data.reasoning as string | undefined,
    txHash: data.txHash as string | undefined,
  };
}

// ── EngineRun ───────────────────────────────────────────────────────────────

export function dbToEngineRun(row: Tables<"engine_runs">): EngineRun {
  return {
    id: row.id,
    vaultId: row.vault_id,
    status: row.status as EngineRun["status"],
    currentState: row.current_state as EngineRun["currentState"],
    activeMarketId: row.active_market_id,
    startedAt: row.started_at,
    stoppedAt: row.stopped_at,
    lastHeartbeatAt: row.last_heartbeat_at,
    lastError: row.last_error,
  };
}

export function engineRunToDb(run: Omit<EngineRun, "id"> & { id?: string }): TablesInsert<"engine_runs"> {
  return {
    id: run.id ?? `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    vault_id: run.vaultId,
    status: run.status,
    current_state: run.currentState,
    active_market_id: run.activeMarketId,
    started_at: run.startedAt,
    stopped_at: run.stoppedAt,
    last_heartbeat_at: run.lastHeartbeatAt,
    last_error: run.lastError,
  };
}

export function engineRunPatchToDb(patch: Partial<EngineRun>): TablesUpdate<"engine_runs"> {
  const p: TablesUpdate<"engine_runs"> = {};
  if (patch.status !== undefined) p.status = patch.status;
  if (patch.currentState !== undefined) p.current_state = patch.currentState;
  if (patch.activeMarketId !== undefined) p.active_market_id = patch.activeMarketId;
  if (patch.stoppedAt !== undefined) p.stopped_at = patch.stoppedAt;
  if (patch.lastHeartbeatAt !== undefined) p.last_heartbeat_at = patch.lastHeartbeatAt;
  if (patch.lastError !== undefined) p.last_error = patch.lastError;
  return p;
}

// ── VirtualOrder ────────────────────────────────────────────────────────────

export function dbToVirtualOrder(row: Tables<"virtual_orders">): VirtualOrder {
  return {
    id: row.id,
    engineRunId: row.engine_run_id,
    marketId: row.market_id,
    side: row.side as MarketSide,
    intent: row.intent as "BUY" | "SELL",
    tokenId: row.token_id,
    price: row.price,
    submittedQty: row.submitted_qty,
    filledQty: row.filled_qty,
    remainingQty: row.remaining_qty,
    status: row.status as VirtualOrder["status"],
    clientRef: row.client_ref,
    placedAt: row.placed_at,
    expiresAt: row.expires_at,
    simulated: row.simulated,
    rejectionReason: row.rejection_reason,
  };
}

export function virtualOrderToDb(
  order: Omit<VirtualOrder, "id"> & { id?: string },
  vaultId: string,
): TablesInsert<"virtual_orders"> {
  return {
    id: order.id ?? `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    engine_run_id: order.engineRunId,
    vault_id: vaultId,
    market_id: order.marketId,
    side: order.side,
    intent: order.intent,
    token_id: order.tokenId,
    price: order.price,
    submitted_qty: order.submittedQty,
    filled_qty: order.filledQty,
    remaining_qty: order.remainingQty,
    status: order.status,
    client_ref: order.clientRef,
    placed_at: order.placedAt,
    expires_at: order.expiresAt,
    simulated: order.simulated,
    rejection_reason: order.rejectionReason,
  };
}

export function virtualOrderPatchToDb(patch: Partial<VirtualOrder>): TablesUpdate<"virtual_orders"> {
  const p: TablesUpdate<"virtual_orders"> = {};
  if (patch.filledQty !== undefined) p.filled_qty = patch.filledQty;
  if (patch.remainingQty !== undefined) p.remaining_qty = patch.remainingQty;
  if (patch.status !== undefined) p.status = patch.status;
  if (patch.rejectionReason !== undefined) p.rejection_reason = patch.rejectionReason;
  return p;
}

// ── MarketState ─────────────────────────────────────────────────────────────

export function dbToMarketState(row: Tables<"market_states">): MarketState {
  return {
    market: row.market as unknown as MarketState["market"],
    sides: row.sides as unknown as MarketState["sides"],
    totalNewEntries: row.total_new_entries,
    isExpired: row.is_expired,
    buyCancelDone: row.buy_cancel_done,
    sellCancelDone: row.sell_cancel_done,
    pendingOldMarketId: row.pending_old_market_id,
  };
}

export function marketStateToDb(vaultId: string, state: MarketState): TablesInsert<"market_states"> {
  return {
    vault_id: vaultId,
    market: j(state.market),
    sides: j(state.sides),
    total_new_entries: state.totalNewEntries,
    is_expired: state.isExpired,
    buy_cancel_done: state.buyCancelDone,
    sell_cancel_done: state.sellCancelDone,
    pending_old_market_id: state.pendingOldMarketId,
  };
}

// ── PnL Snapshot ────────────────────────────────────────────────────────────

export function dbToPnlSnapshot(row: Tables<"pnl_snapshots">): PnlSnapshot {
  return {
    vaultId: row.vault_id,
    runId: row.run_id,
    totalRealizedPnl: row.total_realized_pnl,
    totalUnrealizedPnl: row.total_unrealized_pnl,
    totalPnl: row.total_pnl,
    totalInventoryCost: row.total_inventory_cost,
    totalOpenNotional: row.total_open_notional,
    totalCompletedCycles: row.total_completed_cycles,
    sideBreakdown: row.side_breakdown as unknown as PnlSnapshot["sideBreakdown"],
    computedAt: row.computed_at,
  };
}

export function pnlSnapshotToDb(snap: PnlSnapshot): TablesInsert<"pnl_snapshots"> {
  return {
    vault_id: snap.vaultId,
    run_id: snap.runId,
    total_realized_pnl: snap.totalRealizedPnl,
    total_unrealized_pnl: snap.totalUnrealizedPnl,
    total_pnl: snap.totalPnl,
    total_inventory_cost: snap.totalInventoryCost,
    total_open_notional: snap.totalOpenNotional,
    total_completed_cycles: snap.totalCompletedCycles,
    side_breakdown: j(snap.sideBreakdown),
    computed_at: snap.computedAt,
  };
}

// ── Audit Record (engine) ──────────────────────────────────────────────────

export function auditRecordToDb(vaultId: string, event: AuditRecord): TablesInsert<"audit_events"> {
  const { type, timestamp, ...rest } = event;
  return {
    vault_id: vaultId,
    type,
    timestamp,
    data: j(rest),
  };
}

export function dbToAuditRecord(row: Tables<"audit_events">): AuditRecord {
  const data = (row.data ?? {}) as Record<string, unknown>;
  return {
    type: row.type,
    timestamp: row.timestamp,
    ...data,
  } as AuditRecord;
}

// ── StrategyConfig ──────────────────────────────────────────────────────────

export function dbToStrategyConfig(row: Tables<"strategy_configs">): StrategyConfig {
  return {
    enabled: row.enabled,
    entryPrice: row.entry_price,
    exitPrice: row.exit_price,
    orderSize: row.order_size,
    maxCapitalUsdc: row.max_capital_usdc ?? undefined,
    maxTradesPerMarket: row.max_trades_per_market,
    maxTradesPolicy: row.max_trades_policy as StrategyConfig["maxTradesPolicy"],
    noNewEntriesLastSeconds: row.no_new_entries_last_seconds,
    keepSellOrdersAfterExpirySeconds: row.keep_sell_orders_after_expiry_seconds,
    reconcileIntervalCycles: row.reconcile_interval_cycles,
    minSpreadRequired: row.min_spread_required ?? undefined,
    strictPassiveOnly: row.strict_passive_only,
    allowBothSides: row.allow_both_sides,
    cancelOpenBuysOnExpiry: row.cancel_open_buys_on_expiry,
    autoReentryEnabled: row.auto_reentry_enabled,
  };
}

export function strategyConfigToDb(vaultId: string, config: StrategyConfig): TablesInsert<"strategy_configs"> {
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
  };
}

// ── Books ───────────────────────────────────────────────────────────────────

export function dbToBooks(row: Tables<"cached_books">): Books {
  return row.books as unknown as Books;
}

export function booksToDb(vaultId: string, books: Books): TablesInsert<"cached_books"> {
  return {
    vault_id: vaultId,
    books: j(books),
  };
}
