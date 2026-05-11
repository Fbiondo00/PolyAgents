-- Migration 002: Drop orphaned Arc columns, add max_drawdown_usdc

-- Arc sponsor columns no longer used after Polymarket-native pivot
ALTER TABLE market_states DROP COLUMN IF EXISTS arc_market_id;
ALTER TABLE market_states DROP COLUMN IF EXISTS arc_resolved;
ALTER TABLE market_states DROP COLUMN IF EXISTS arc_claimed;

-- Risk guard: max drawdown before auto-stop
ALTER TABLE strategy_configs ADD COLUMN IF NOT EXISTS max_drawdown_usdc REAL NOT NULL DEFAULT 50.0;
