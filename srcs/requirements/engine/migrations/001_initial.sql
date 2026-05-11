-- PolyAgents initial schema (sqlx-compatible)
-- 8 tables: vaults, engine_runs, virtual_orders, market_states,
--           strategy_configs, pnl_snapshots, audit_events, cached_books

-- Vaults
CREATE TABLE vaults (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  wallet_address TEXT,
  strategy JSONB NOT NULL DEFAULT '{}',
  funding JSONB NOT NULL DEFAULT '{}',
  inventory JSONB NOT NULL DEFAULT '{}',
  stats JSONB NOT NULL DEFAULT '{}',
  mode TEXT NOT NULL DEFAULT 'advisory',
  token_balance INTEGER NOT NULL DEFAULT 0,
  active_market JSONB,
  sparkline JSONB,
  created BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- Engine Runs
CREATE TABLE engine_runs (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'stopped',
  current_state TEXT NOT NULL DEFAULT 'IDLE',
  active_market_id TEXT,
  started_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  stopped_at BIGINT,
  last_heartbeat_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  last_error TEXT
);

CREATE INDEX idx_engine_runs_vault_status ON engine_runs(vault_id, status);

-- Virtual Orders
CREATE TABLE virtual_orders (
  id TEXT PRIMARY KEY,
  engine_run_id TEXT NOT NULL REFERENCES engine_runs(id) ON DELETE CASCADE,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  market_id TEXT NOT NULL,
  side TEXT NOT NULL,
  intent TEXT NOT NULL,
  token_id TEXT NOT NULL,
  price REAL NOT NULL,
  submitted_qty INTEGER NOT NULL,
  filled_qty INTEGER NOT NULL DEFAULT 0,
  remaining_qty INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  client_ref TEXT NOT NULL,
  placed_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  expires_at BIGINT,
  simulated BOOLEAN NOT NULL DEFAULT FALSE,
  rejection_reason TEXT
);

CREATE INDEX idx_orders_vault_side_intent_status ON virtual_orders(vault_id, side, intent, status);
CREATE INDEX idx_orders_engine_run ON virtual_orders(engine_run_id);

-- Market States
CREATE TABLE market_states (
  vault_id TEXT PRIMARY KEY REFERENCES vaults(id) ON DELETE CASCADE,
  market JSONB,
  sides JSONB,
  total_new_entries INTEGER NOT NULL DEFAULT 0,
  is_expired BOOLEAN NOT NULL DEFAULT FALSE,
  buy_cancel_done BOOLEAN NOT NULL DEFAULT FALSE,
  sell_cancel_done BOOLEAN NOT NULL DEFAULT FALSE,
  pending_old_market_id TEXT,
  arc_market_id INTEGER,
  arc_resolved BOOLEAN NOT NULL DEFAULT FALSE,
  arc_claimed BOOLEAN NOT NULL DEFAULT FALSE
);

-- Strategy Configs
CREATE TABLE strategy_configs (
  vault_id TEXT PRIMARY KEY REFERENCES vaults(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  entry_price REAL NOT NULL DEFAULT 0.20,
  exit_price REAL NOT NULL DEFAULT 0.25,
  order_size INTEGER NOT NULL DEFAULT 10,
  max_capital_usdc REAL,
  max_trades_per_market INTEGER NOT NULL DEFAULT 1,
  max_trades_policy TEXT NOT NULL DEFAULT 'side',
  no_new_entries_last_seconds INTEGER NOT NULL DEFAULT 10,
  keep_sell_orders_after_expiry_seconds INTEGER NOT NULL DEFAULT 10,
  reconcile_interval_cycles INTEGER NOT NULL DEFAULT 8,
  min_spread_required REAL,
  strict_passive_only BOOLEAN NOT NULL DEFAULT TRUE,
  allow_both_sides BOOLEAN NOT NULL DEFAULT TRUE,
  cancel_open_buys_on_expiry BOOLEAN NOT NULL DEFAULT TRUE,
  auto_reentry_enabled BOOLEAN NOT NULL DEFAULT FALSE
);

-- PnL Snapshots
CREATE TABLE pnl_snapshots (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  total_realized_pnl REAL NOT NULL DEFAULT 0,
  total_unrealized_pnl REAL NOT NULL DEFAULT 0,
  total_pnl REAL NOT NULL DEFAULT 0,
  total_inventory_cost REAL NOT NULL DEFAULT 0,
  total_open_notional REAL NOT NULL DEFAULT 0,
  total_completed_cycles INTEGER NOT NULL DEFAULT 0,
  side_breakdown JSONB NOT NULL DEFAULT '{}',
  computed_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX idx_pnl_vault_computed ON pnl_snapshots(vault_id, computed_at);

-- Audit Events
CREATE TABLE audit_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  timestamp BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  data JSONB
);

CREATE INDEX idx_audits_vault_timestamp ON audit_events(vault_id, timestamp DESC);

-- Cached Books
CREATE TABLE cached_books (
  vault_id TEXT PRIMARY KEY REFERENCES vaults(id) ON DELETE CASCADE,
  books JSONB NOT NULL DEFAULT '{}',
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);
