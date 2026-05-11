use anyhow::Result;
use sqlx::PgPool;

use poly_types::engine::{EngineRun, EngineRunStatus, EngineState};

pub async fn create(pool: &PgPool, run: &EngineRun) -> Result<()> {
    sqlx::query(
        "INSERT INTO engine_runs (id, vault_id, status, current_state, active_market_id,
         started_at, stopped_at, last_heartbeat_at, last_error)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)"
    )
    .bind(&run.id)
    .bind(&run.vault_id)
    .bind(run.status.to_string())
    .bind(run.current_state.to_string())
    .bind(&run.active_market_id)
    .bind(run.started_at)
    .bind(run.stopped_at)
    .bind(run.last_heartbeat_at)
    .bind(&run.last_error)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_active(pool: &PgPool, vault_id: &str) -> Result<Option<EngineRun>> {
    let row = sqlx::query_as::<_, EngineRunRow>(
        "SELECT id, vault_id, status, current_state, active_market_id,
         started_at, stopped_at, last_heartbeat_at, last_error
         FROM engine_runs WHERE vault_id = $1 AND status = 'running'
         ORDER BY started_at DESC LIMIT 1"
    )
    .bind(vault_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| r.into_run()))
}

pub async fn update_state(pool: &PgPool, id: &str, state: EngineState, heartbeat: i64) -> Result<()> {
    sqlx::query(
        "UPDATE engine_runs SET current_state = $2, last_heartbeat_at = $3 WHERE id = $1"
    )
    .bind(id)
    .bind(state.to_string())
    .bind(heartbeat)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn stop(pool: &PgPool, id: &str, stopped_at: i64) -> Result<()> {
    sqlx::query(
        "UPDATE engine_runs SET status = 'stopped', stopped_at = $2 WHERE id = $1"
    )
    .bind(id)
    .bind(stopped_at)
    .execute(pool)
    .await?;
    Ok(())
}

#[derive(sqlx::FromRow)]
struct EngineRunRow {
    id: String,
    vault_id: String,
    status: String,
    current_state: String,
    active_market_id: Option<String>,
    started_at: i64,
    stopped_at: Option<i64>,
    last_heartbeat_at: i64,
    last_error: Option<String>,
}

impl EngineRunRow {
    fn into_run(self) -> EngineRun {
        EngineRun {
            id: self.id,
            vault_id: self.vault_id,
            status: match self.status.as_str() {
                "running" => EngineRunStatus::Running,
                "error" => EngineRunStatus::Error,
                _ => EngineRunStatus::Stopped,
            },
            current_state: parse_state(&self.current_state),
            active_market_id: self.active_market_id,
            started_at: self.started_at,
            stopped_at: self.stopped_at,
            last_heartbeat_at: self.last_heartbeat_at,
            last_error: self.last_error,
        }
    }
}

fn parse_state(s: &str) -> EngineState {
    match s {
        "DISCOVERING_MARKET" => EngineState::DiscoveringMarket,
        "READY" => EngineState::Ready,
        "QUOTING" => EngineState::Quoting,
        "HOLDING_INVENTORY" => EngineState::HoldingInventory,
        "EXPIRY_GUARD" => EngineState::ExpiryGuard,
        "ROLLING_OVER" => EngineState::RollingOver,
        "RECONCILING" => EngineState::Reconciling,
        _ => EngineState::Idle,
    }
}
