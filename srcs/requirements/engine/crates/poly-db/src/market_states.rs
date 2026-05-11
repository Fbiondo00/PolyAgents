use anyhow::Result;
use sqlx::PgPool;

use poly_types::market::MarketState;

pub async fn get(pool: &PgPool, vault_id: &str) -> Result<Option<MarketState>> {
    let row = sqlx::query_as::<_, MarketStateRow>(
        "SELECT vault_id, market, sides, total_new_entries, is_expired,
         buy_cancel_done, sell_cancel_done, pending_old_market_id
         FROM market_states WHERE vault_id = $1"
    )
    .bind(vault_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| {
        let market: Option<poly_types::market::Market> = r.market
            .and_then(|v| serde_json::from_value(v).ok());
        MarketState {
            vault_id: r.vault_id,
            market,
            sides: r.sides,
            total_new_entries: r.total_new_entries,
            is_expired: r.is_expired,
            buy_cancel_done: r.buy_cancel_done,
            sell_cancel_done: r.sell_cancel_done,
            pending_old_market_id: r.pending_old_market_id,
        }
    }))
}

pub async fn upsert(pool: &PgPool, state: &MarketState) -> Result<()> {
    let market_json = state.market.as_ref().map(serde_json::to_value).transpose()?;

    sqlx::query(
        "INSERT INTO market_states (vault_id, market, sides, total_new_entries, is_expired,
         buy_cancel_done, sell_cancel_done, pending_old_market_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (vault_id) DO UPDATE SET
           market = $2, sides = $3, total_new_entries = $4, is_expired = $5,
           buy_cancel_done = $6, sell_cancel_done = $7, pending_old_market_id = $8"
    )
    .bind(&state.vault_id)
    .bind(&market_json)
    .bind(&state.sides)
    .bind(state.total_new_entries)
    .bind(state.is_expired)
    .bind(state.buy_cancel_done)
    .bind(state.sell_cancel_done)
    .bind(&state.pending_old_market_id)
    .execute(pool)
    .await?;
    Ok(())
}

#[derive(sqlx::FromRow)]
struct MarketStateRow {
    vault_id: String,
    market: Option<serde_json::Value>,
    sides: Option<serde_json::Value>,
    total_new_entries: i32,
    is_expired: bool,
    buy_cancel_done: bool,
    sell_cancel_done: bool,
    pending_old_market_id: Option<String>,
}
