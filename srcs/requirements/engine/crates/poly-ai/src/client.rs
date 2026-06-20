use anyhow::Result;
use reqwest::Client;

use poly_types::ai::{AiRequest, AiResponse, BidPrices, SideBias, TradingDecision};
use poly_types::config::AiConfig;
use poly_types::market::{Market, OrderBook};

const MAX_RETRIES: u32 = 3;
const TIMEOUT_SECS: u64 = 10;

fn default_decision() -> TradingDecision {
    TradingDecision {
        side_bias: SideBias::Neutral,
        confidence: 0.0,
        bid_prices: BidPrices {
            yes_price: rust_decimal::Decimal::new(1, 2), // 0.01
            no_price: rust_decimal::Decimal::new(1, 2),
            yes_size: rust_decimal::Decimal::from(10),
            no_size: rust_decimal::Decimal::from(10),
        },
        reasoning: "AI unavailable, using neutral defaults".into(),
    }
}

pub struct AiClient {
    http: Client,
    config: AiConfig,
}

impl AiClient {
    pub fn new(config: AiConfig) -> Self {
        let http = Client::builder()
            .timeout(std::time::Duration::from_secs(TIMEOUT_SECS))
            .build()
            .unwrap_or_default();

        Self { http, config }
    }

    pub async fn get_trading_decision(
        &self,
        market: &Market,
        book: &OrderBook,
        side_history: &str,
    ) -> Result<TradingDecision> {
        let prompt = crate::prompt::build_strategy_prompt(market, book, side_history);

        let request = AiRequest {
            model: self.config.model.clone(),
            messages: vec![
                poly_types::ai::AiMessage {
                    role: "system".into(),
                    content: crate::prompt::SYSTEM_PROMPT.into(),
                },
                poly_types::ai::AiMessage {
                    role: "user".into(),
                    content: prompt,
                },
            ],
            max_tokens: self.config.max_tokens,
            temperature: 0.3,
        };

        for attempt in 1..=MAX_RETRIES {
            match self.call_api(&request).await {
                Ok(decision) => return Ok(decision),
                Err(e) => {
                    tracing::warn!(attempt = attempt, error = %e, "AI API call failed");
                    if attempt < MAX_RETRIES {
                        tokio::time::sleep(std::time::Duration::from_millis(500 * attempt as u64))
                            .await;
                    }
                }
            }
        }

        // All retries exhausted — return safe neutral defaults
        tracing::warn!("All AI retries exhausted, using neutral fallback");
        Ok(default_decision())
    }

    async fn call_api(&self, request: &AiRequest) -> Result<TradingDecision> {
        let mut req = self
            .http
            .post(format!("{}/v1/chat/completions", self.config.api_base))
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .json(request);

        // Langfuse-routed gateways (e.g. Craftshost) require the public key header too.
        if let Some(pk) = &self.config.public_key {
            req = req.header("X-Langfuse-Public-Key", pk);
        }

        let resp = req
            .send()
            .await?
            .error_for_status()?
            .json::<AiResponse>()
            .await?;

        let content = resp
            .choices
            .first()
            .map(|c| c.message.content.clone())
            .ok_or_else(|| anyhow::anyhow!("No response from AI"))?;

        parse_decision(&content)
    }
}

fn parse_decision(content: &str) -> Result<TradingDecision> {
    let json_str = extract_json(content);
    let decision: TradingDecision = serde_json::from_str(&json_str)
        .map_err(|e| anyhow::anyhow!("Failed to parse AI decision: {} - content: {}", e, content))?;
    Ok(decision)
}

fn extract_json(text: &str) -> String {
    if let Some(start) = text.find("```json") && let Some(end) = text[start + 7..].find("```") {
        return text[start + 7..start + 7 + end].trim().to_string();
    }
    if let Some(start) = text.find('{') && let Some(end) = text.rfind('}') {
        return text[start..=end].to_string();
    }
    text.to_string()
}
