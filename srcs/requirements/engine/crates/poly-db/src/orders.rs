use anyhow::Result;
use sqlx::PgPool;

use poly_types::market::{OrderIntent, Side};
use poly_types::order::{OrderStatus, VirtualOrder};

pub async fn insert(pool: &PgPool, order: &VirtualOrder) -> Result<()> {
    sqlx::query(
        "INSERT INTO virtual_orders (id, engine_run_id, vault_id, market_id, side, intent,
         token_id, price, submitted_qty, filled_qty, remaining_qty, status, client_ref,
         placed_at, expires_at, simulated, rejection_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)"
    )
    .bind(&order.id)
    .bind(&order.engine_run_id)
    .bind(&order.vault_id)
    .bind(&order.market_id)
    .bind(format!("{:?}", order.side).to_lowercase())
    .bind(format!("{:?}", order.intent).to_uppercase())
    .bind(&order.token_id)
    .bind(order.price)
    .bind(order.submitted_qty)
    .bind(order.filled_qty)
    .bind(order.remaining_qty)
    .bind(format!("{:?}", order.status).to_uppercase())
    .bind(&order.client_ref)
    .bind(order.placed_at)
    .bind(order.expires_at)
    .bind(order.simulated)
    .bind(&order.rejection_reason)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_open_by_vault(pool: &PgPool, vault_id: &str) -> Result<Vec<VirtualOrder>> {
    let rows = sqlx::query_as::<_, OrderRow>(
        "SELECT id, engine_run_id, vault_id, market_id, side, intent,
         token_id, price, submitted_qty, filled_qty, remaining_qty, status,
         client_ref, placed_at, expires_at, simulated, rejection_reason
         FROM virtual_orders
         WHERE vault_id = $1 AND status IN ('OPEN', 'PARTIALLY_FILLED')
         ORDER BY placed_at DESC"
    )
    .bind(vault_id)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(|r| r.into_order()).collect())
}

pub async fn update_status(pool: &PgPool, id: &str, status: OrderStatus, filled_qty: i32) -> Result<()> {
    sqlx::query(
        "UPDATE virtual_orders SET status = $2, filled_qty = $3 WHERE id = $1"
    )
    .bind(id)
    .bind(format!("{:?}", status).to_uppercase())
    .bind(filled_qty)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn cancel_by_vault(pool: &PgPool, vault_id: &str) -> Result<u64> {
    let result = sqlx::query(
        "UPDATE virtual_orders SET status = 'CANCELLED'
         WHERE vault_id = $1 AND status IN ('OPEN', 'PARTIALLY_FILLED')"
    )
    .bind(vault_id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected())
}

#[derive(sqlx::FromRow)]
struct OrderRow {
    id: String,
    engine_run_id: String,
    vault_id: String,
    market_id: String,
    side: String,
    intent: String,
    token_id: String,
    price: f32,
    submitted_qty: i32,
    filled_qty: i32,
    remaining_qty: i32,
    status: String,
    client_ref: String,
    placed_at: i64,
    expires_at: Option<i64>,
    simulated: bool,
    rejection_reason: Option<String>,
}

impl OrderRow {
    fn into_order(self) -> VirtualOrder {
        VirtualOrder {
            id: self.id,
            engine_run_id: self.engine_run_id,
            vault_id: self.vault_id,
            market_id: self.market_id,
            side: match self.side.as_str() {
                "sell" => Side::Sell,
                _ => Side::Buy,
            },
            intent: match self.intent.as_str() {
                "SELL" => OrderIntent::Sell,
                _ => OrderIntent::Buy,
            },
            token_id: self.token_id,
            price: self.price,
            submitted_qty: self.submitted_qty,
            filled_qty: self.filled_qty,
            remaining_qty: self.remaining_qty,
            status: parse_order_status(&self.status),
            client_ref: self.client_ref,
            placed_at: self.placed_at,
            expires_at: self.expires_at,
            simulated: self.simulated,
            rejection_reason: self.rejection_reason,
        }
    }
}

fn parse_order_status(s: &str) -> OrderStatus {
    match s {
        "PARTIALLY_FILLED" => OrderStatus::PartiallyFilled,
        "FILLED" => OrderStatus::Filled,
        "CANCELLED" => OrderStatus::Cancelled,
        "EXPIRED" => OrderStatus::Expired,
        "REJECTED" => OrderStatus::Rejected,
        _ => OrderStatus::Open,
    }
}
