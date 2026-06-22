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
        let body = serde_json::to_string(payload)?;
        let headers = build_l2_headers(&self.config, "POST", "/order", address, &body)?;

        let resp = self
            .http
            .post(format!("{}/order", self.base_url))
            .header("POLY-ADDRESS", address)
            .header("POLY-API-KEY", headers.api_key)
            .header("POLY-SIGNATURE", headers.signature)
            .header("POLY-TIMESTAMP", headers.timestamp)
            .header("POLY-PASSPHRASE", headers.passphrase)
            .header("Content-Type", "application/json")
            .body(body)
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
        // Simulated/non-live mode: there is no live order on the CLOB to cancel,
        // so return success without touching the exchange. This keeps the
        // simulated path as the default, matching `simulate()` above.
        if !self.config.live {
            tracing::info!(
                order_id = %order_id,
                "Simulated cancel (POLYMARKET_LIVE=false): no live CLOB call"
            );
            return Ok(());
        }

        // Live mode: POST /order with an array of order ids to cancel. The
        // Polymarket CLOB cancel endpoint requires the full L2 auth headers.
        let path = "/order";
        let body = serde_json::json!({ "orderIDs": [order_id] }).to_string();
        let address = crate::signing::derive_address(&self.config.private_key)
            .unwrap_or_else(|_| String::new());
        let headers = build_l2_headers(&self.config, "POST", path, &address, &body)?;

        self.http
            .post(format!("{}{}", self.base_url, path))
            .header("POLY-ADDRESS", address)
            .header("POLY-API-KEY", headers.api_key)
            .header("POLY-SIGNATURE", headers.signature)
            .header("POLY-TIMESTAMP", headers.timestamp)
            .header("POLY-PASSPHRASE", headers.passphrase)
            .header("Content-Type", "application/json")
            .body(body)
            .send()
            .await?
            .error_for_status()
            .map_err(|e| anyhow::anyhow!("CLOB cancel failed for {}: {}", order_id, e))?;

        tracing::info!(order_id = %order_id, "Live CLOB order cancelled");
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

/// Polymarket CLOB L2 authentication headers. Every authenticated write
/// (`POST /order`, `POST /order` cancel) must attach all five of these or the
/// CLOB rejects the request as unauthenticated (see audit finding: "submit_order
/// missing required API key authentication headers").
///
/// Reference scheme:
///   POLY-API-KEY    -> config.api_key
///   POLY-SIGNATURE  -> base64( HMAC-SHA256( base64_decode(config.api_secret),
///                                           timestamp + method + path + body ) )
///   POLY-TIMESTAMP  -> unix seconds (string)
///   POLY-PASSPHRASE -> config.api_passphrase
///   POLY-ADDRESS    -> derived EOA address (attached at the call site)
pub struct L2Headers {
    pub api_key: String,
    pub signature: String,
    pub timestamp: String,
    pub passphrase: String,
}

/// Build the L2 auth header set for a CLOB request.
///
/// `method`, `path`, and `body` form the canonical message that the server
/// re-derives and verifies. `address` is the wallet address of the signer
/// (used for the `POLY-ADDRESS` header at the call site).
pub fn build_l2_headers(
    config: &PolymarketConfig,
    method: &str,
    path: &str,
    address: &str,
    body: &str,
) -> Result<L2Headers> {
    let timestamp = chrono::Utc::now().timestamp().to_string();

    // Canonical message: "<timestamp><method><path><body>".
    let message = format!("{timestamp}{method}{path}{body}");

    // TODO(l2-signing): implement the HMAC-SHA256 signature per the Polymarket
    // CLOB spec. The signature is base64(HMAC-SHA256(base64_decode(api_secret),
    // message)). This requires the `hmac`, `sha2`, and `base64` crates to be
    // added to poly-market/Cargo.toml:
    //   let key = base64::decode(&config.api_secret)?;
    //   let mut mac = Hmac::<Sha256>::new_from_slice(&key)?;
    //   mac.update(message.as_bytes());
    //   let signature = base64::encode(mac.finalize().into_bytes());
    // Until those deps are wired up, we emit a clearly-invalid placeholder so a
    // misconfigured live call fails loudly at the CLOB (401) rather than being
    // silently sent without the header set. Live trading must not be enabled
    // until this TODO is implemented and validated.
    let signature = if config.api_secret.is_empty() {
        String::new()
    } else {
        tracing::warn!(
            "L2 HMAC signing not implemented (TODO): sending placeholder POLY-SIGNATURE; \
             live CLOB call for {} {} will be rejected until signing is wired up",
            method,
            path
        );
        format!("UNSIGNED_TODO_{}", hex::encode(message.as_bytes()))
    };

    let _ = (address,);

    Ok(L2Headers {
        api_key: config.api_key.clone(),
        signature,
        timestamp,
        passphrase: config.api_passphrase.clone(),
    })
}
