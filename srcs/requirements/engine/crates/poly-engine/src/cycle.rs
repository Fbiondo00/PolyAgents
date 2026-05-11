use anyhow::Result;
use poly_db::PgPool;

use poly_ai::AiClient;
use poly_market::{MarketAdapter, PolymarketAdapter};
use poly_types::config::AppConfig;
use poly_types::engine::EngineState;
use poly_types::market::{AuditEvent, MarketParams, PnlSnapshot, Side};
use poly_types::order::{NewOrder, OrderStatus, VirtualOrder};
use poly_types::vault::Vault;

pub struct CycleRunner<'a> {
    pool: &'a PgPool,
    market: &'a PolymarketAdapter,
    ai: &'a AiClient,
    vault: &'a Vault,
    run_id: &'a str,
    config: &'a AppConfig,
    agent_private_key: Option<String>,
}

impl<'a> CycleRunner<'a> {
    pub fn new(
        config: &'a AppConfig,
        pool: &'a PgPool,
        market: &'a PolymarketAdapter,
        ai: &'a AiClient,
        vault: &'a Vault,
        run_id: &'a str,
        agent_private_key: Option<String>,
    ) -> Self {
        Self {
            config,
            pool,
            market,
            ai,
            vault,
            run_id,
            agent_private_key,
        }
    }

    pub async fn run_cycle(&self) -> Result<()> {
        let now = chrono::Utc::now().timestamp_millis();
        let vault_id = &self.vault.id;

        tracing::info!("Cycle start for vault {}", vault_id);

        // Update heartbeat
        poly_db::engine_runs::update_state(self.pool, self.run_id, EngineState::DiscoveringMarket, now).await?;

        // 1. Discover market
        let market = self
            .market
            .discover_market(MarketParams {
                query: "bitcoin".into(),
                active_only: true,
            })
            .await?;

        tracing::info!("Discovered market: {} - {}", market.id, market.question);

        // 2. Get order book
        let yes_token = market.tokens.first().ok_or_else(|| {
            anyhow::anyhow!("Market {} missing YES token", market.id)
        })?;
        let no_token = market.tokens.get(1).ok_or_else(|| {
            anyhow::anyhow!("Market {} missing NO token", market.id)
        })?;

        let yes_id = &yes_token.token_id;
        let (best_bid, best_ask) = self.market.get_book_top(yes_id).await?;

        let book = poly_types::market::OrderBook {
            market_id: market.id.clone(),
            bids: vec![poly_types::market::PriceLevel { price: best_bid, size: rust_decimal::Decimal::ZERO }],
            asks: vec![poly_types::market::PriceLevel { price: best_ask, size: rust_decimal::Decimal::ZERO }],
            timestamp: chrono::Utc::now().timestamp_millis(),
        };

        // 3. Get AI decision
        let decision = self
            .ai
            .get_trading_decision(&market, &book, "[]")
            .await?;

        tracing::info!(
            "AI decision: bias={:?}, confidence={:.2}",
            decision.side_bias,
            decision.confidence
        );

        // 4. Audit the cycle
        self.audit("cycle-start", &serde_json::json!({
            "market_id": market.id,
            "question": market.question,
            "ai_bias": format!("{:?}", decision.side_bias),
            "ai_confidence": decision.confidence,
        }))
        .await?;

        // 5. Place orders
        if decision.confidence > 0.1 {
            let yes_price = decision.bid_prices.yes_price;
            let yes_size = decision.bid_prices.yes_size;

            let yes_order = NewOrder {
                market_id: market.id.clone(),
                token_id: yes_id.clone(),
                side: Side::Buy,
                price: yes_price,
                size: yes_size,
            };

            let yes_result = if let Some(ref key) = self.agent_private_key {
                self.market.place_order_with_key(yes_order, key).await
            } else {
                self.market.place_order(yes_order).await
            };
            match yes_result {
                Ok(result) => {
                    tracing::info!("YES order placed: {}", result.order_id);
                    self.record_order(&result, yes_id, Side::Buy, &market.id, yes_price, yes_size).await?;
                }
                Err(e) => {
                    tracing::warn!("YES order failed: {}", e);
                    self.audit("order-failed", &serde_json::json!({
                        "side": "YES",
                        "error": e.to_string(),
                    }))
                    .await?;
                }
            }

            let no_price = decision.bid_prices.no_price;
            let no_size = decision.bid_prices.no_size;

            let no_order = NewOrder {
                market_id: market.id.clone(),
                token_id: no_token.token_id.clone(),
                side: Side::Buy,
                price: no_price,
                size: no_size,
            };

            let no_result = if let Some(ref key) = self.agent_private_key {
                self.market.place_order_with_key(no_order, key).await
            } else {
                self.market.place_order(no_order).await
            };
            match no_result {
                Ok(result) => {
                    tracing::info!("NO order placed: {}", result.order_id);
                    self.record_order(&result, &no_token.token_id, Side::Buy, &market.id, no_price, no_size).await?;
                }
                Err(e) => {
                    tracing::warn!("NO order failed: {}", e);
                }
            }
        }

        // 6. Update state
        poly_db::engine_runs::update_state(
            self.pool,
            self.run_id,
            EngineState::Quoting,
            chrono::Utc::now().timestamp_millis(),
        )
        .await?;

        // 7. Snapshot PnL
        let pnl = PnlSnapshot {
            id: None,
            vault_id: vault_id.clone(),
            run_id: self.run_id.into(),
            total_realized_pnl: 0.0,
            total_unrealized_pnl: 0.0,
            total_pnl: 0.0,
            total_inventory_cost: 0.0,
            total_open_notional: 0.0,
            total_completed_cycles: 1,
            side_breakdown: serde_json::json!({}),
            computed_at: chrono::Utc::now().timestamp_millis(),
        };
        poly_db::pnl::insert(self.pool, &pnl).await?;

        self.audit("cycle-complete", &serde_json::json!({
            "market_id": market.id,
        }))
        .await?;

        tracing::info!("Cycle complete for vault {}", vault_id);
        Ok(())
    }

    async fn audit(&self, event_type: &str, data: &serde_json::Value) -> Result<()> {
        let event = AuditEvent {
            id: None,
            vault_id: self.vault.id.clone(),
            event_type: event_type.into(),
            timestamp: chrono::Utc::now().timestamp_millis(),
            data: Some(data.clone()),
        };
        poly_db::audit::insert(self.pool, &event).await?;
        Ok(())
    }

    async fn record_order(
        &self,
        result: &poly_types::order::OrderResult,
        token_id: &str,
        side: Side,
        market_id: &str,
        price: rust_decimal::Decimal,
        size: rust_decimal::Decimal,
    ) -> Result<()> {
        let now = chrono::Utc::now().timestamp_millis();
        let qty: i32 = size.try_into().unwrap_or(0);
        let order = VirtualOrder {
            id: result.order_id.clone(),
            engine_run_id: self.run_id.into(),
            vault_id: self.vault.id.clone(),
            market_id: market_id.into(),
            side,
            intent: poly_types::market::OrderIntent::Buy,
            token_id: token_id.into(),
            price: price.try_into().unwrap_or(0.0f32),
            submitted_qty: qty,
            filled_qty: 0,
            remaining_qty: qty,
            status: OrderStatus::Open,
            client_ref: uuid::Uuid::new_v4().to_string(),
            placed_at: now,
            expires_at: None,
            simulated: !self.config.polymarket.live,
            rejection_reason: None,
        };
        poly_db::orders::insert(self.pool, &order).await?;
        Ok(())
    }
}
