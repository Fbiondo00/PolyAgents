use anyhow::Result;
use reqwest::Client;
use rust_decimal::Decimal;

use poly_types::config::PolymarketConfig;
use poly_types::market::{OrderBook, PriceLevel};
use poly_types::order::{NewOrder, OrderResult, OrderStatus};

pub struct ClobClient {
    http: Client,
    base_url: String,
    config: PolymarketConfig,
}

impl ClobClient {
    pub fn new(config: &PolymarketConfig, http: Client) -> Self {
        Self {
            http,
            base_url: "https://clob.polymarket.com".into(),
            config: config.clone(),
        }
    }

    pub async fn get_order_book(&self, market_id: &str) -> Result<OrderBook> {
        let resp = self
            .http
            .get(format!("{}/book", self.base_url))
            .query(&[("token_id", market_id)])
            .send()
            .await?
            .error_for_status()
            .map_err(|e| anyhow::anyhow!("CLOB book request failed: {}", e))?;

        let body: serde_json::Value = resp.json().await?;

        let bids = parse_price_levels(&body["bids"]);
        let asks = parse_price_levels(&body["asks"]);

        Ok(OrderBook {
            market_id: market_id.into(),
            bids,
            asks,
            timestamp: chrono::Utc::now().timestamp_millis(),
        })
    }

    pub async fn place_order(&self, order: NewOrder) -> Result<OrderResult> {
        if let Some(simulated) = self.simulate(&order) {
            return Ok(simulated);
        }

        let payload = crate::signing::build_order_payload(&self.config, &order)?;

        let address = crate::signing::derive_address(&self.config.private_key)?;

        self.submit_order(&address, &payload).await
    }

    /// Place an order signed with a specific private key (per-vault EOA).
    pub async fn place_order_with_key(
        &self,
        order: NewOrder,
        private_key: &str,
    ) -> Result<OrderResult> {
        if let Some(simulated) = self.simulate(&order) {
            return Ok(simulated);
        }

        let payload = crate::signing::build_order_payload_for_key(private_key, &order)?;

        let address = crate::signing::derive_address(private_key)?;

        self.submit_order(&address, &payload).await
    }

    /// In non-live mode (`polymarket.live == false`) we never touch the CLOB:
    /// signing requires a funded Polygon EOA, and there is no testnet. Return a
    /// synthetic OPEN order so the engine can record, monitor, and reconcile it
    /// exactly like a live order. Fill status is later decided by the reconciler
    /// (authoritative `get_order` when live, book-cross inference when simulated).
    fn simulate(&self, order: &NewOrder) -> Option<OrderResult> {
        if self.config.live {
            return None;
        }
        let mut bytes = [0u8; 8];
        use rand::RngCore;
        rand::thread_rng().fill_bytes(&mut bytes);
        let order_id = format!("sim-{}", hex::encode(bytes));
        tracing::info!(
            order_id = %order_id,
            token_id = %order.token_id,
            price = %order.price,
            "Simulated order placed (POLYMARKET_LIVE=false)"
        );
        Some(OrderResult {
            order_id,
            status: OrderStatus::Open,
            filled_size: Decimal::ZERO,
        })
    }

    /// Authoritative order status from the CLOB (`GET /order/{id}`). Used by the
    /// reconciler to determine real fills when `POLYMARKET_LIVE=true`. Returns
    /// the raw status string and filled size; the caller maps it.
    pub async fn get_order(&self, order_id: &str) -> Result<OrderState> {
        let resp = self
            .http
            .get(format!("{}/data/order/{}", self.base_url, order_id))
            .send()
            .await?
            .error_for_status()
            .map_err(|e| anyhow::anyhow!("CLOB get_order failed for {order_id}: {e}"))?;

        let body: serde_json::Value = resp.json().await?;
        let status = body["status"]
            .as_str()
            .unwrap_or("UNKNOWN")
            .to_ascii_lowercase();
        let size_matched = body["size_matched"]
            .as_str()
            .and_then(|s| s.parse::<Decimal>().ok())
            .unwrap_or(Decimal::ZERO);
        Ok(OrderState {
            status,
            size_matched,
        })
    }

    async fn submit_order(
        &self,
        address: &str,
        payload: &serde_json::Value,
    ) -> Result<OrderResult> {
        let resp = self
            .http
            .post(format!("{}/order", self.base_url))
            .header("POLY-ADDRESS", address)
            .json(payload)
            .send()
            .await?
            .error_for_status()
            .map_err(|e| anyhow::anyhow!("CLOB order request failed: {}", e))?;

        let body: serde_json::Value = resp.json().await?;

        if let Some(error) = body.get("error").or_else(|| body.get("message"))
            && let Some(msg) = error.as_str()
        {
            anyhow::bail!("CLOB rejected order: {}", msg);
        }

        let order_id = body["orderID"]
            .as_str()
            .unwrap_or("unknown")
            .to_string();

        Ok(OrderResult {
            order_id,
            status: OrderStatus::Open,
            filled_size: Decimal::ZERO,
        })
    }

    pub async fn cancel_order(&self, order_id: &str) -> Result<()> {
        self.http
            .delete(format!("{}/order/{}", self.base_url, order_id))
            .send()
            .await?
            .error_for_status()
            .map_err(|e| anyhow::anyhow!("CLOB cancel failed for {}: {}", order_id, e))?;
        Ok(())
    }
}

/// Authoritative live order state read from `GET /data/order/{id}`.
///
/// `status` is the raw lowercased CLOB status string ("matched", "live",
/// "canceled", ...). `size_matched` is the cumulative filled size. The
/// reconciler maps this into the engine's `OrderStatus` + filled quantity.
#[derive(Debug, Clone)]
pub struct OrderState {
    pub status: String,
    pub size_matched: Decimal,
}

fn parse_price_levels(v: &serde_json::Value) -> Vec<PriceLevel> {
    v.as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|l| {
                    let price = l["price"].as_str().and_then(|s| s.parse().ok())?;
                    let size = l["size"].as_str().and_then(|s| s.parse().ok())?;
                    Some(PriceLevel { price, size })
                })
                .collect()
        })
        .unwrap_or_default()
}
