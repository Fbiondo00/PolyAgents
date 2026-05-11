use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradingDecision {
    pub side_bias: SideBias,
    pub confidence: f32,
    pub bid_prices: BidPrices,
    pub reasoning: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum SideBias {
    Bullish,
    Bearish,
    Neutral,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BidPrices {
    pub yes_price: Decimal,
    pub no_price: Decimal,
    pub yes_size: Decimal,
    pub no_size: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiRequest {
    pub model: String,
    pub messages: Vec<AiMessage>,
    pub max_tokens: u32,
    pub temperature: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiResponse {
    pub choices: Vec<AiChoice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiChoice {
    pub message: AiMessage,
}
