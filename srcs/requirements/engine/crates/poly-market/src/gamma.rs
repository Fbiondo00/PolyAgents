use anyhow::Result;
use reqwest::Client;

use poly_types::market::{Market, MarketParams, Token};

pub struct GammaClient {
    http: Client,
    base_url: String,
}

impl GammaClient {
    pub fn new(http: Client) -> Self {
        Self {
            http,
            base_url: "https://gamma-api.polymarket.com".into(),
        }
    }

    pub async fn search_markets(&self, params: MarketParams) -> Result<Market> {
        let resp: serde_json::Value = self
            .http
            .get(format!("{}/markets", self.base_url))
            .query(&[
                ("tag", params.query.as_str()),
                ("active", "true"),
                ("closed", "false"),
                ("limit", "50"),
            ])
            .send()
            .await?
            .error_for_status()
            .map_err(|e| anyhow::anyhow!("Gamma API request failed: {}", e))?
            .json()
            .await?;

        let markets = resp
            .as_array()
            .ok_or_else(|| anyhow::anyhow!("Expected array from Gamma API"))?;

        // Filter for active BTC markets, preferring 5-minute markets
        let market = markets
            .iter()
            .filter(|m| {
                let active = m["active"].as_bool().unwrap_or(false);
                let closed = m["closed"].as_bool().unwrap_or(true);
                let question = m["question"].as_str().unwrap_or("").to_lowercase();
                active && !closed && (question.contains("bitcoin") || question.contains("btc"))
            })
            .min_by_key(|m| {
                // Prefer markets expiring soonest (nearest 5-min slot)
                m["end_date_iso"]
                    .as_str()
                    .and_then(|s| s.parse::<i64>().ok())
                    .unwrap_or(i64::MAX)
            })
            .ok_or_else(|| anyhow::anyhow!("No active BTC market found"))?;

        Ok(parse_market(market))
    }

    pub async fn get_market(&self, condition_id: &str) -> Result<Market> {
        let resp: serde_json::Value = self
            .http
            .get(format!("{}/markets/{}", self.base_url, condition_id))
            .send()
            .await?
            .error_for_status()
            .map_err(|e| anyhow::anyhow!("Gamma market lookup failed: {}", e))?
            .json()
            .await?;

        Ok(parse_market(&resp))
    }
}

fn parse_market(v: &serde_json::Value) -> Market {
    let tokens = v["tokens"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .map(|t| Token {
                    token_id: t["token_id"].as_str().unwrap_or("").into(),
                    outcome: t["outcome"].as_str().unwrap_or("").into(),
                    price: t["price"]
                        .as_str()
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(rust_decimal::Decimal::ZERO),
                })
                .collect()
        })
        .unwrap_or_default();

    Market {
        id: v["id"].as_str().unwrap_or("").into(),
        question: v["question"].as_str().unwrap_or("").into(),
        condition_id: v["condition_id"].as_str().unwrap_or("").into(),
        slug: v["slug"].as_str().unwrap_or("").into(),
        active: v["active"].as_bool().unwrap_or(false),
        closed: v["closed"].as_bool().unwrap_or(true),
        end_date: v["end_date"].as_str().map(String::from),
        tokens,
    }
}
