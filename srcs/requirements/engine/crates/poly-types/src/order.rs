use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::market::{OrderIntent, Side};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VirtualOrder {
    pub id: String,
    pub engine_run_id: String,
    pub vault_id: String,
    pub market_id: String,
    pub side: Side,
    pub intent: OrderIntent,
    pub token_id: String,
    pub price: f32,
    pub submitted_qty: i32,
    pub filled_qty: i32,
    pub remaining_qty: i32,
    pub status: OrderStatus,
    pub client_ref: String,
    pub placed_at: i64,
    pub expires_at: Option<i64>,
    pub simulated: bool,
    pub rejection_reason: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum OrderStatus {
    Open,
    PartiallyFilled,
    Filled,
    Cancelled,
    Expired,
    Rejected,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewOrder {
    pub market_id: String,
    pub token_id: String,
    pub side: Side,
    pub price: Decimal,
    pub size: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderResult {
    pub order_id: String,
    pub status: OrderStatus,
    pub filled_size: Decimal,
}
