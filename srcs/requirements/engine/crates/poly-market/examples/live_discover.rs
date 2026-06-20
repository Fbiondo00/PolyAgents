//! Live discovery smoke test against Polymarket Gamma.
//!   cargo run -p poly-market --example live_discover
use poly_market::{MarketAdapter, PolymarketAdapter};
use poly_types::config::PolymarketConfig;
use poly_types::market::MarketParams;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cfg = PolymarketConfig::default();
    let http = reqwest::Client::new();
    let adapter = PolymarketAdapter::new(&cfg, http);

    let market = adapter
        .discover_market(MarketParams {
            query: "bitcoin".into(),
            active_only: true,
        })
        .await?;

    println!(
        "discovered: id={}  q={:?}  tokens={}  end={:?}",
        market.id,
        market.question,
        market.tokens.len(),
        market.end_date
    );
    for t in &market.tokens {
        println!(
            "  token {} outcome={} price={}",
            t.token_id, t.outcome, t.price
        );
    }

    assert_eq!(market.tokens.len(), 2, "must be binary");
    assert!(
        !market.tokens[0].token_id.is_empty(),
        "YES token id required"
    );
    assert!(
        !market.tokens[1].token_id.is_empty(),
        "NO token id required"
    );
    println!("✅ LIVE OK: binary market with 2 CLOB tokens");
    Ok(())
}
