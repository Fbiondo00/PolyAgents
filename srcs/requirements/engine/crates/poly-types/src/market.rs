use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Market {
    pub id: String,
    pub question: String,
    pub condition_id: String,
    pub slug: String,
    pub active: bool,
    pub closed: bool,
    pub end_date: Option<String>,
    pub tokens: Vec<Token>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Token {
    pub token_id: String,
    pub outcome: String,
    pub price: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderBook {
    pub market_id: String,
    pub bids: Vec<PriceLevel>,
    pub asks: Vec<PriceLevel>,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriceLevel {
    pub price: Decimal,
    pub size: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookUpdate {
    pub market_id: String,
    pub side: Side,
    pub price: Decimal,
    pub size: Decimal,
    pub is_remove: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketParams {
    pub query: String,
    pub active_only: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Side {
    Buy,
    Sell,
}

impl Side {
    pub fn opposite(&self) -> Self {
        match self {
            Side::Buy => Side::Sell,
            Side::Sell => Side::Buy,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum OrderIntent {
    Buy,
    Sell,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketState {
    pub vault_id: String,
    pub market: Option<Market>,
    pub sides: Option<serde_json::Value>,
    pub total_new_entries: i32,
    pub is_expired: bool,
    pub buy_cancel_done: bool,
    pub sell_cancel_done: bool,
    pub pending_old_market_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PnlSnapshot {
    pub id: Option<i64>,
    pub vault_id: String,
    pub run_id: String,
    pub total_realized_pnl: f32,
    pub total_unrealized_pnl: f32,
    pub total_pnl: f32,
    pub total_inventory_cost: f32,
    pub total_open_notional: f32,
    pub total_completed_cycles: i32,
    pub side_breakdown: serde_json::Value,
    pub computed_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEvent {
    pub id: Option<i64>,
    pub vault_id: String,
    pub event_type: String,
    pub timestamp: i64,
    pub data: Option<serde_json::Value>,
}
