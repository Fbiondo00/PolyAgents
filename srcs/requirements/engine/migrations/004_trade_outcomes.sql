-- One row per AI trading decision, later reconciled with the market's outcome.
-- This is the learning signal: decision context + the orders it produced + the
-- lagged result (fills, resolution, realized PnL).
--
-- Lifecycle: inserted OPEN at decision time with only decision+order columns;
-- the reconciler later flips status to RECONCILED once the market closes and
-- fills/PnL are known (outcomes are inherently lagged on 5-min markets).
CREATE TABLE trade_outcomes (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    vault_id        TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    run_id          TEXT NOT NULL,
    market_id       TEXT NOT NULL,
    -- decision context (captured at quote time)
    decided_at      BIGINT NOT NULL,
    ai_side_bias    TEXT,
    ai_confidence   REAL,
    ai_reasoning    TEXT,
    decision_inputs JSONB,
    -- the orders this decision produced
    yes_order_id    TEXT,
    no_order_id     TEXT,
    -- result (filled in by reconciliation)
    status          TEXT NOT NULL DEFAULT 'OPEN', -- OPEN -> RECONCILED | FAILED
    yes_filled_qty  INTEGER NOT NULL DEFAULT 0,
    no_filled_qty   INTEGER NOT NULL DEFAULT 0,
    market_closed   BOOLEAN,
    winning_side    TEXT, -- YES/NO/null until resolved
    realized_pnl    REAL,
    pnl_detail      JSONB,
    reconciled_at   BIGINT
);

CREATE INDEX idx_outcomes_vault_status ON trade_outcomes(vault_id, status);
CREATE INDEX idx_outcomes_market ON trade_outcomes(market_id);
