-- PolyAgents initial schema
-- 8 tables: vaults, engine_runs, virtual_orders, market_states,
--           strategy_configs, pnl_snapshots, audit_events, cached_books

-- ── Vaults ────────────────────────────────────────────────────────────────

create table public.vaults (
  id text primary key,
  name text not null,
  wallet_address text,
  strategy jsonb not null default '{}',
  funding jsonb not null default '{}',
  inventory jsonb not null default '{}',
  stats jsonb not null default '{}',
  mode text not null default 'advisory',
  token_balance integer not null default 0,
  active_market jsonb,
  sparkline jsonb,
  created bigint not null default (extract(epoch from now()) * 1000)::bigint
);

-- ── Engine Runs ───────────────────────────────────────────────────────────

create table public.engine_runs (
  id text primary key,
  vault_id text not null references public.vaults(id) on delete cascade,
  status text not null default 'stopped',
  current_state text not null default 'IDLE',
  active_market_id text,
  started_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  stopped_at bigint,
  last_heartbeat_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  last_error text
);

create index idx_engine_runs_vault_status on public.engine_runs(vault_id, status);

-- ── Virtual Orders ────────────────────────────────────────────────────────

create table public.virtual_orders (
  id text primary key,
  engine_run_id text not null references public.engine_runs(id) on delete cascade,
  vault_id text not null references public.vaults(id) on delete cascade,
  market_id text not null,
  side text not null,
  intent text not null,
  token_id text not null,
  price real not null,
  submitted_qty integer not null,
  filled_qty integer not null default 0,
  remaining_qty integer not null,
  status text not null default 'OPEN',
  client_ref text not null,
  placed_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  expires_at bigint,
  simulated boolean not null default false,
  rejection_reason text
);

create index idx_orders_vault_side_intent_status on public.virtual_orders(vault_id, side, intent, status);
create index idx_orders_engine_run on public.virtual_orders(engine_run_id);

-- ── Market States ─────────────────────────────────────────────────────────

create table public.market_states (
  vault_id text primary key references public.vaults(id) on delete cascade,
  market jsonb,
  sides jsonb,
  total_new_entries integer not null default 0,
  is_expired boolean not null default false,
  buy_cancel_done boolean not null default false,
  sell_cancel_done boolean not null default false,
  pending_old_market_id text,
  arc_market_id integer,
  arc_resolved boolean not null default false,
  arc_claimed boolean not null default false
);

-- ── Strategy Configs ──────────────────────────────────────────────────────

create table public.strategy_configs (
  vault_id text primary key references public.vaults(id) on delete cascade,
  enabled boolean not null default true,
  entry_price real not null default 0.20,
  exit_price real not null default 0.25,
  order_size integer not null default 10,
  max_capital_usdc real,
  max_trades_per_market integer not null default 1,
  max_trades_policy text not null default 'side',
  no_new_entries_last_seconds integer not null default 10,
  keep_sell_orders_after_expiry_seconds integer not null default 10,
  reconcile_interval_cycles integer not null default 8,
  min_spread_required real,
  strict_passive_only boolean not null default true,
  allow_both_sides boolean not null default true,
  cancel_open_buys_on_expiry boolean not null default true,
  auto_reentry_enabled boolean not null default false
);

-- ── PnL Snapshots ─────────────────────────────────────────────────────────

create table public.pnl_snapshots (
  id bigint generated always as identity primary key,
  vault_id text not null references public.vaults(id) on delete cascade,
  run_id text not null,
  total_realized_pnl real not null default 0,
  total_unrealized_pnl real not null default 0,
  total_pnl real not null default 0,
  total_inventory_cost real not null default 0,
  total_open_notional real not null default 0,
  total_completed_cycles integer not null default 0,
  side_breakdown jsonb not null default '{}',
  computed_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

create index idx_pnl_vault_computed on public.pnl_snapshots(vault_id, computed_at);

-- ── Audit Events ──────────────────────────────────────────────────────────

create table public.audit_events (
  id bigint generated always as identity primary key,
  vault_id text not null references public.vaults(id) on delete cascade,
  type text not null,
  timestamp bigint not null default (extract(epoch from now()) * 1000)::bigint,
  data jsonb
);

create index idx_audits_vault_timestamp on public.audit_events(vault_id, timestamp desc);

-- ── Cached Books ──────────────────────────────────────────────────────────

create table public.cached_books (
  vault_id text primary key references public.vaults(id) on delete cascade,
  books jsonb not null default '{}',
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

-- ── Realtime ──────────────────────────────────────────────────────────────

alter publication supabase_realtime add table public.pnl_snapshots;
alter publication supabase_realtime add table public.audit_events;
alter publication supabase_realtime add table public.virtual_orders;
alter publication supabase_realtime add table public.engine_runs;
