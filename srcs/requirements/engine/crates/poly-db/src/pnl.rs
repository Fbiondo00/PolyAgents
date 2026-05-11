use anyhow::Result;
use sqlx::PgPool;

use poly_types::market::PnlSnapshot;

pub async fn insert(pool: &PgPool, snapshot: &PnlSnapshot) -> Result<()> {
    sqlx::query(
        "INSERT INTO pnl_snapshots (vault_id, run_id, total_realized_pnl,
         total_unrealized_pnl, total_pnl, total_inventory_cost,
         total_open_notional, total_completed_cycles, side_breakdown, computed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)"
    )
    .bind(&snapshot.vault_id)
    .bind(&snapshot.run_id)
    .bind(snapshot.total_realized_pnl)
    .bind(snapshot.total_unrealized_pnl)
    .bind(snapshot.total_pnl)
    .bind(snapshot.total_inventory_cost)
    .bind(snapshot.total_open_notional)
    .bind(snapshot.total_completed_cycles)
    .bind(&snapshot.side_breakdown)
    .bind(snapshot.computed_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_latest(pool: &PgPool, vault_id: &str) -> Result<Option<PnlSnapshot>> {
    let row = sqlx::query_as::<_, PnlRow>(
        "SELECT id, vault_id, run_id, total_realized_pnl, total_unrealized_pnl,
         total_pnl, total_inventory_cost, total_open_notional,
         total_completed_cycles, side_breakdown, computed_at
         FROM pnl_snapshots WHERE vault_id = $1
         ORDER BY computed_at DESC LIMIT 1"
    )
    .bind(vault_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| r.into_snapshot()))
}

pub async fn get_history(pool: &PgPool, vault_id: &str, limit: i64) -> Result<Vec<PnlSnapshot>> {
    let rows = sqlx::query_as::<_, PnlRow>(
        "SELECT id, vault_id, run_id, total_realized_pnl, total_unrealized_pnl,
         total_pnl, total_inventory_cost, total_open_notional,
         total_completed_cycles, side_breakdown, computed_at
         FROM pnl_snapshots WHERE vault_id = $1
         ORDER BY computed_at DESC LIMIT $2"
    )
    .bind(vault_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(|r| r.into_snapshot()).collect())
}

#[derive(sqlx::FromRow)]
struct PnlRow {
    id: i64,
    vault_id: String,
    run_id: String,
    total_realized_pnl: f32,
    total_unrealized_pnl: f32,
    total_pnl: f32,
    total_inventory_cost: f32,
    total_open_notional: f32,
    total_completed_cycles: i32,
    side_breakdown: serde_json::Value,
    computed_at: i64,
}

impl PnlRow {
    fn into_snapshot(self) -> PnlSnapshot {
        PnlSnapshot {
            id: Some(self.id),
            vault_id: self.vault_id,
            run_id: self.run_id,
            total_realized_pnl: self.total_realized_pnl,
            total_unrealized_pnl: self.total_unrealized_pnl,
            total_pnl: self.total_pnl,
            total_inventory_cost: self.total_inventory_cost,
            total_open_notional: self.total_open_notional,
            total_completed_cycles: self.total_completed_cycles,
            side_breakdown: self.side_breakdown,
            computed_at: self.computed_at,
        }
    }
}
