use anyhow::Result;
use reqwest::Client;

use poly_types::ai::{AiRequest, AiResponse, TradingDecision};
use poly_types::config::AiConfig;
use poly_types::market::{Market, OrderBook};

const MAX_RETRIES: u32 = 3;
// Reasoning models behind a timed proxy can take a while (and the Langfuse/
// Cloudflare edge has been observed to intermittently reject long-held requests);
// give each attempt generous headroom. The 3-retry loop still bounds total time.
const TIMEOUT_SECS: u64 = 60;

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
                    content: Some(crate::prompt::SYSTEM_PROMPT.into()),
                },
                poly_types::ai::AiMessage {
                    role: "user".into(),
                    content: Some(prompt),
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

        // All retries exhausted — return safe neutral defaults.
        tracing::warn!("All AI retries exhausted, using neutral fallback");
        Ok(TradingDecision {
            reasoning: "AI unavailable, using neutral defaults".into(),
            ..TradingDecision::default()
        })
    }

    async fn call_api(&self, request: &AiRequest) -> Result<TradingDecision> {
        let mut req = self
            .http
            .post(format!("{}/v1/chat/completions", self.config.api_base))
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .json(request);

        // Langfuse-routed gateways (e.g. Craftshost) require the public key header
        // too. Gate it on a non-empty value so an unset/blank OPENAI_PUBLIC_KEY
        // doesn't send a header that would cause every call to be rejected.
        if let Some(pk) = self.config.public_key.as_deref().filter(|s| !s.is_empty()) {
            req = req.header("X-Langfuse-Public-Key", pk);
        }

        let resp = req
            .send()
            .await?
            .error_for_status()?
            .json::<AiResponse>()
            .await?;

        let choice = resp
            .choices
            .into_iter()
            .next()
            .ok_or_else(|| anyhow::anyhow!("AI returned no choices"))?;

        let content = choice.message.content.unwrap_or_default();
        if content.trim().is_empty() {
            // Distinct error so logs reveal token-exhaustion / empty-content cases
            // (common with reasoning models that spent the budget on chain-of-thought)
            // instead of surfacing as a generic JSON parse error downstream.
            return Err(anyhow::anyhow!(
                "AI returned empty content (finish_reason={:?})",
                choice.finish_reason
            ));
        }

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
