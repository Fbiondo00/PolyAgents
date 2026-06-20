//! Live smoke test against the configured AI gateway.
//!
//! Run from the engine dir:
//!   set -a && source ../../../.env && set +a
//!   cargo run -p poly-ai --example live_craftshost
//!
//! Constructs an `AiClient` exactly as the engine does (via `AppConfig::from_env`),
//! calls `get_trading_decision` with a mock BTC 5-min market + order book, and
//! asserts the decision is usable: parses (lenient types), has confidence > 0.1
//! (so the engine's order gate passes), and is not the all-zero fallback.

use poly_ai::AiClient;
use poly_types::config::AppConfig;
use poly_types::market::{Market, OrderBook, PriceLevel, Token};
use rust_decimal::Decimal;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = AppConfig::from_env()?;
    println!(
        "gateway: {}  model: {}  max_tokens: {}  public_key_set: {}",
        config.ai.api_base,
        config.ai.model,
        config.ai.max_tokens,
        config.ai.public_key.is_some()
    );

    let client = AiClient::new(config.ai);

    let market = Market {
        id: "smoke-test".into(),
        question: "Will BTC go Up in the next 5 minutes?".into(),
        condition_id: "0x".into(),
        slug: "btc-up-5m".into(),
        active: true,
        closed: false,
        end_date: None,
        tokens: vec![
            Token {
                token_id: "yes".into(),
                outcome: "Up".into(),
                price: Decimal::new(50, 2),
            },
            Token {
                token_id: "no".into(),
                outcome: "Down".into(),
                price: Decimal::new(50, 2),
            },
        ],
    };
    let book = OrderBook {
        market_id: "smoke-test".into(),
        bids: vec![PriceLevel {
            price: Decimal::new(1, 2),
            size: Decimal::from(500),
        }],
        asks: vec![PriceLevel {
            price: Decimal::new(99, 2),
            size: Decimal::from(400),
        }],
        timestamp: 0,
    };

    let decision = client
        .get_trading_decision(&market, &book, "UP, UP, DOWN, UP, UP")
        .await?;

    println!(
        "decision: bias={:?} confidence={:.3} reasoning={:?}",
        decision.side_bias, decision.confidence, decision.reasoning
    );

    let is_fallback = decision.reasoning == "AI unavailable, using neutral defaults";
    println!("is_fallback (AI unreachable): {is_fallback}");

    assert!(
        !is_fallback,
        "AI fell back to neutral — gateway/auth/parse is still broken"
    );
    assert!(
        decision.confidence > 0.1,
        "confidence {} does not clear the engine's >0.1 order gate",
        decision.confidence
    );

    println!("✅ LIVE OK: non-fallback decision with confidence > 0.1");
    Ok(())
}
