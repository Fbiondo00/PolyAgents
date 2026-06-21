use anyhow::Result;
use poly_ai::AiClient;
use poly_db::PgPool;
use poly_market::{MarketAdapter, PolymarketAdapter};
use poly_types::ai::TradingDecision;
use poly_types::config::AppConfig;
use poly_types::engine::EngineState;
use poly_types::market::{AuditEvent, Market, MarketParams, OrderBook, Side};
use poly_types::order::{NewOrder, OrderStatus, VirtualOrder};
use poly_types::vault::Vault;

/// The full result of one discovery+decision pass, carried into `quote()`.
///
/// This is the seam Phase 1's `trade_outcomes` row reads from: it captures the
/// market, the AI decision, the YES/NO token ids, and the order ids once placed.
/// Splitting `run_cycle()` into `discover()` + `quote()` also fixes the bug where
/// the full cycle (discover → decide → place orders) ran *twice* per state loop
/// (once in `DiscoveringMarket`, once in `Quoting`).
pub struct CycleDecision {
    pub market: Market,
    pub yes_token_id: String,
    pub no_token_id: String,
    pub best_bid: rust_decimal::Decimal,
    pub best_ask: rust_decimal::Decimal,
    pub decision: TradingDecision,
    /// Order ids once `quote()` has placed them (empty before quoting).
    pub yes_order_id: Option<String>,
    pub no_order_id: Option<String>,
}

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

    /// Discover a market, fetch its book, and ask the AI for a decision.
    /// Returns the decision context but places NO orders. (`DiscoveringMarket`.)
    pub async fn discover(&self) -> Result<CycleDecision> {
        poly_db::engine_runs::update_state(
            self.pool,
            self.run_id,
            EngineState::DiscoveringMarket,
            chrono::Utc::now().timestamp_millis(),
        )
        .await?;

        let market = self
            .market
            .discover_market(MarketParams {
                query: "bitcoin".into(),
                active_only: true,
            })
            .await?;

        tracing::info!("Discovered market: {} - {}", market.id, market.question);

        let yes_token = market
            .tokens
            .first()
            .ok_or_else(|| anyhow::anyhow!("Market {} missing YES token", market.id))?;
        let no_token = market
            .tokens
            .get(1)
            .ok_or_else(|| anyhow::anyhow!("Market {} missing NO token", market.id))?;

        // Take owned copies of the token ids so `market` can move into the
        // decision below without holding a borrow into `market.tokens`.
        let yes_id = yes_token.token_id.clone();
        let no_id = no_token.token_id.clone();
        let (best_bid, best_ask) = self.market.get_book_top(&yes_id).await?;

        let book = OrderBook {
            market_id: market.id.clone(),
            bids: vec![poly_types::market::PriceLevel {
                price: best_bid,
                size: rust_decimal::Decimal::ZERO,
            }],
            asks: vec![poly_types::market::PriceLevel {
                price: best_ask,
                size: rust_decimal::Decimal::ZERO,
            }],
            timestamp: chrono::Utc::now().timestamp_millis(),
        };

        // Load active guidance (OpenClaw's reflection output) and feed it into
        // the AI prompt — the closed learning loop. Cheap DB read per cycle.
        let guidance = poly_db::guidance::get(self.pool, &self.vault.id)
            .await
            .unwrap_or_default();
        let guidance_opt = (!guidance.is_empty()).then_some(guidance.as_str());

        let decision = self
            .ai
            .get_trading_decision(&market, &book, "[]", guidance_opt)
            .await?;

        tracing::info!(
            "AI decision: bias={:?}, confidence={:.2}",
            decision.side_bias,
            decision.confidence
        );

        self.audit(
            "cycle-start",
            &serde_json::json!({
                "market_id": market.id,
                "question": market.question,
                "ai_bias": format!("{:?}", decision.side_bias),
                "ai_confidence": decision.confidence,
            }),
        )
        .await?;

        Ok(CycleDecision {
            market,
            yes_token_id: yes_id,
            no_token_id: no_id,
            best_bid,
            best_ask,
            decision,
            yes_order_id: None,
            no_order_id: None,
        })
    }

    /// Place YES+NO bids from a prior `discover()` decision. Mutates the
    /// decision to record the placed order ids. (`Quoting`.)
    pub async fn quote(&self, decision: &mut CycleDecision) -> Result<()> {
        let d = &decision.decision;
        let vault_id = &self.vault.id;

        // Order gate: only place bids when the AI clears a minimal confidence.
        if d.confidence <= 0.1 {
            tracing::info!(
                vault_id = vault_id,
                confidence = d.confidence,
                "Confidence below order gate, skipping bids"
            );
            self.audit(
                "skip-low-confidence",
                &serde_json::json!({
                    "market_id": decision.market.id,
                    "ai_confidence": d.confidence,
                }),
            )
            .await?;
            return Ok(());
        }

        let yes_price = d.bid_prices.yes_price;
        let yes_size = d.bid_prices.yes_size;
        let yes_order = NewOrder {
            market_id: decision.market.id.clone(),
            token_id: decision.yes_token_id.clone(),
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
                self.record_order(
                    &result,
                    &decision.yes_token_id,
                    Side::Buy,
                    &decision.market.id,
                    yes_price,
                    yes_size,
                )
                .await?;
                decision.yes_order_id = Some(result.order_id);
            }
            Err(e) => {
                tracing::warn!("YES order failed: {}", e);
                self.audit(
                    "order-failed",
                    &serde_json::json!({ "side": "YES", "error": e.to_string() }),
                )
                .await?;
            }
        }

        let no_price = d.bid_prices.no_price;
        let no_size = d.bid_prices.no_size;
        let no_order = NewOrder {
            market_id: decision.market.id.clone(),
            token_id: decision.no_token_id.clone(),
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
                self.record_order(
                    &result,
                    &decision.no_token_id,
                    Side::Buy,
                    &decision.market.id,
                    no_price,
                    no_size,
                )
                .await?;
                decision.no_order_id = Some(result.order_id);
            }
            Err(e) => {
                tracing::warn!("NO order failed: {}", e);
                self.audit(
                    "order-failed",
                    &serde_json::json!({ "side": "NO", "error": e.to_string() }),
                )
                .await?;
            }
        }

        // Record an OPEN trade outcome: decision context + the order ids just
        // placed. The reconciler later fills the result columns. This is the
        // learning signal — one row per decision, joined to its outcome.
        let decided_at = chrono::Utc::now().timestamp_millis();
        let decision_inputs = serde_json::json!({
            "best_bid": decision.best_bid.to_string(),
            "best_ask": decision.best_ask.to_string(),
            "yes_price": d.bid_prices.yes_price.to_string(),
            "no_price": d.bid_prices.no_price.to_string(),
            "yes_size": d.bid_prices.yes_size.to_string(),
            "no_size": d.bid_prices.no_size.to_string(),
            "simulated": !self.config.polymarket.live,
        });
        if let Err(e) = poly_db::outcomes::insert_open(
            self.pool,
            vault_id,
            self.run_id,
            &decision.market.id,
            decided_at,
            Some(&format!("{:?}", d.side_bias)),
            Some(d.confidence),
            (!d.reasoning.is_empty()).then_some(d.reasoning.as_str()),
            Some(&decision_inputs),
            decision.yes_order_id.as_deref(),
            decision.no_order_id.as_deref(),
        )
        .await
        {
            tracing::warn!("trade_outcome insert failed: {}", e);
        }

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
