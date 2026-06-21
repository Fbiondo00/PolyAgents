use anyhow::Result;
use sqlx::PgPool;

use poly_types::outcome::TradeOutcome;

/// Insert a new OPEN outcome at decision time, returning its generated id.
pub async fn insert_open(
    pool: &PgPool,
    vault_id: &str,
    run_id: &str,
    market_id: &str,
    decided_at: i64,
    ai_side_bias: Option<&str>,
    ai_confidence: Option<f32>,
    ai_reasoning: Option<&str>,
    decision_inputs: Option<&serde_json::Value>,
    yes_order_id: Option<&str>,
    no_order_id: Option<&str>,
) -> Result<i64> {
    let row: (i64,) = sqlx::query_as(
        "INSERT INTO trade_outcomes (vault_id, run_id, market_id, decided_at,
         ai_side_bias, ai_confidence, ai_reasoning, decision_inputs,
         yes_order_id, no_order_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'OPEN')
         RETURNING id",
    )
    .bind(vault_id)
    .bind(run_id)
    .bind(market_id)
    .bind(decided_at)
    .bind(ai_side_bias)
    .bind(ai_confidence)
    .bind(ai_reasoning)
    .bind(decision_inputs)
    .bind(yes_order_id)
    .bind(no_order_id)
    .fetch_one(pool)
    .await?;
    Ok(row.0)
}

/// Flip an OPEN outcome to RECONCILED with the resolved result + PnL.
#[allow(clippy::too_many_arguments)]
pub async fn mark_reconciled(
    pool: &PgPool,
    id: i64,
    yes_filled_qty: i32,
    no_filled_qty: i32,
    market_closed: bool,
    winning_side: Option<&str>,
    realized_pnl: Option<f32>,
    pnl_detail: Option<&serde_json::Value>,
    reconciled_at: i64,
) -> Result<()> {
    sqlx::query(
        "UPDATE trade_outcomes
         SET status = 'RECONCILED', yes_filled_qty = $2, no_filled_qty = $3,
             market_closed = $4, winning_side = $5, realized_pnl = $6,
             pnl_detail = $7, reconciled_at = $8
         WHERE id = $1",
    )
    .bind(id)
    .bind(yes_filled_qty)
    .bind(no_filled_qty)
    .bind(market_closed)
    .bind(winning_side)
    .bind(realized_pnl)
    .bind(pnl_detail)
    .bind(reconciled_at)
    .execute(pool)
    .await?;
    Ok(())
}

/// Mark an outcome FAILED (e.g. market could not be resolved) so the reconciler
/// stops retrying it.
pub async fn mark_failed(pool: &PgPool, id: i64, reconciled_at: i64) -> Result<()> {
    sqlx::query("UPDATE trade_outcomes SET status = 'FAILED', reconciled_at = $2 WHERE id = $1")
        .bind(id)
        .bind(reconciled_at)
        .execute(pool)
        .await?;
    Ok(())
}

/// OPEN outcomes older than `min_age_ms` for a vault — the reconciler's work queue.
pub async fn get_open_older_than(
    pool: &PgPool,
    vault_id: &str,
    min_age_ms: i64,
    now_ms: i64,
) -> Result<Vec<TradeOutcome>> {
    let rows = sqlx::query_as::<_, OutcomeRow>(
        "SELECT id, vault_id, run_id, market_id, decided_at, ai_side_bias,
         ai_confidence, ai_reasoning, decision_inputs, yes_order_id, no_order_id,
         status, yes_filled_qty, no_filled_qty, market_closed, winning_side,
         realized_pnl, pnl_detail, reconciled_at
         FROM trade_outcomes
         WHERE vault_id = $1 AND status = 'OPEN' AND decided_at < ($2 - $3)
         ORDER BY decided_at ASC",
    )
    .bind(vault_id)
    .bind(now_ms)
    .bind(min_age_ms)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|r| r.into_outcome()).collect())
}

/// Recent outcomes for a vault, newest first (the learning signal view).
pub async fn get_recent(pool: &PgPool, vault_id: &str, limit: i64) -> Result<Vec<TradeOutcome>> {
    let rows = sqlx::query_as::<_, OutcomeRow>(
        "SELECT id, vault_id, run_id, market_id, decided_at, ai_side_bias,
         ai_confidence, ai_reasoning, decision_inputs, yes_order_id, no_order_id,
         status, yes_filled_qty, no_filled_qty, market_closed, winning_side,
         realized_pnl, pnl_detail, reconciled_at
         FROM trade_outcomes WHERE vault_id = $1
         ORDER BY decided_at DESC LIMIT $2",
    )
    .bind(vault_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|r| r.into_outcome()).collect())
}

#[derive(sqlx::FromRow)]
struct OutcomeRow {
    id: i64,
    vault_id: String,
    run_id: String,
    market_id: String,
    decided_at: i64,
    ai_side_bias: Option<String>,
    ai_confidence: Option<f32>,
    ai_reasoning: Option<String>,
    decision_inputs: Option<serde_json::Value>,
    yes_order_id: Option<String>,
    no_order_id: Option<String>,
    status: String,
    yes_filled_qty: i32,
    no_filled_qty: i32,
    market_closed: Option<bool>,
    winning_side: Option<String>,
    realized_pnl: Option<f32>,
    pnl_detail: Option<serde_json::Value>,
    reconciled_at: Option<i64>,
}

impl OutcomeRow {
    fn into_outcome(self) -> TradeOutcome {
        TradeOutcome {
            id: Some(self.id),
            vault_id: self.vault_id,
            run_id: self.run_id,
            market_id: self.market_id,
            decided_at: self.decided_at,
            ai_side_bias: self.ai_side_bias,
            ai_confidence: self.ai_confidence,
            ai_reasoning: self.ai_reasoning,
            decision_inputs: self.decision_inputs,
            yes_order_id: self.yes_order_id,
            no_order_id: self.no_order_id,
            status: poly_types::outcome::parse_outcome_status(&self.status),
            yes_filled_qty: self.yes_filled_qty,
            no_filled_qty: self.no_filled_qty,
            market_closed: self.market_closed,
            winning_side: self.winning_side,
            realized_pnl: self.realized_pnl,
            pnl_detail: self.pnl_detail,
            reconciled_at: self.reconciled_at,
        }
    }
}
