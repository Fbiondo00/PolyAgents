use poly_types::market::{Market, OrderBook};

pub const SYSTEM_PROMPT: &str = r#"You are a Polymarket BTC 5-minute binary market trading AI.
Your strategy is passive market-making: place $0.01 limit bids on both YES and NO sides,
then flip fills at $0.02 for 100% spread capture.

Rules:
- Always place bids on BOTH sides (YES and NO) unless confidence > 0.8
- Bid at $0.01, sell at $0.02 (100% spread)
- Never bid above $0.50 on any side
- Cancel unfilled orders 10 seconds before market expiry
- Track inventory and avoid over-concentration on one side

Respond with ONLY a JSON object:
{
  "side_bias": "Bullish" | "Bearish" | "Neutral",
  "confidence": 0.0-1.0,
  "bid_prices": {
    "yes_price": "0.01",
    "no_price": "0.01",
    "yes_size": "10",
    "no_size": "10"
  },
  "reasoning": "one sentence"
}"#;

pub fn build_strategy_prompt(
    market: &Market,
    book: &OrderBook,
    side_history: &str,
    guidance: Option<&str>,
) -> String {
    build_strategy_prompt_with_context(market, book, side_history, None, None, guidance)
}

pub fn build_strategy_prompt_with_context(
    market: &Market,
    book: &OrderBook,
    side_history: &str,
    seconds_to_expiry: Option<i64>,
    inventory: Option<&str>,
    guidance: Option<&str>,
) -> String {
    let best_bid = book
        .bids
        .first()
        .map(|l| l.price.to_string())
        .unwrap_or_else(|| "N/A".into());
    let best_ask = book
        .asks
        .first()
        .map(|l| l.price.to_string())
        .unwrap_or_else(|| "N/A".into());
    let bid_depth: String = book
        .bids
        .iter()
        .take(5)
        .map(|l| format!("{}@{}", l.size, l.price))
        .collect::<Vec<_>>()
        .join(", ");
    let ask_depth: String = book
        .asks
        .iter()
        .take(5)
        .map(|l| format!("{}@{}", l.size, l.price))
        .collect::<Vec<_>>()
        .join(", ");

    let expiry_info = seconds_to_expiry
        .map(|s| format!("{}s", s))
        .unwrap_or_else(|| "unknown".into());

    let inventory_info = inventory
        .map(|s| s.to_string())
        .unwrap_or_else(|| "no inventory".into());

    // Active guidance: contextual advice from OpenClaw's reflection layer (the
    // closed loop). Rendered only when present and non-empty.
    let guidance_info = match guidance {
        Some(g) if !g.trim().is_empty() => format!("{}\n", g.trim()),
        _ => String::new(),
    };

    format!(
        r#"Market: {}
Question: {}
Expires: {} ({} remaining)
Tokens: {}
Inventory: {}
Order Book:
  Bids (top 5): {}
  Asks (top 5): {}
  Best bid/ask: {} / {}
Side history: {}
{}
Provide your trading decision as JSON."#,
        market.id,
        market.question,
        market.end_date.as_deref().unwrap_or("unknown"),
        expiry_info,
        market
            .tokens
            .iter()
            .map(|t| format!("{}={}", t.outcome, t.price))
            .collect::<Vec<_>>()
            .join(", "),
        inventory_info,
        bid_depth,
        ask_depth,
        best_bid,
        best_ask,
        side_history,
        if guidance_info.is_empty() {
            String::new()
        } else {
            format!("Active guidance (from learning):\n{}\n", guidance_info)
        },
    )
}
