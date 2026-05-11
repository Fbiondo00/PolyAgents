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
        let payload = crate::signing::build_order_payload_for_key(private_key, &order)?;

        let address = crate::signing::derive_address(private_key)?;

        self.submit_order(&address, &payload).await
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
