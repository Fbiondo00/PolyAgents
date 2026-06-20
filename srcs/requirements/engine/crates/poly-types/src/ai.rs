use rust_decimal::Decimal;
use serde::{Deserialize, Deserializer, Serialize};

/// A trading decision returned by the AI and consumed by the engine cycle.
///
/// Field deserialization is intentionally lenient: LLMs (especially smaller local
/// models served via Ollama) routinely return lowercase enum values, string-typed
/// confidence ("medium"), or omit optional fields. Without tolerance, a single
/// off-spec token fails serde -> neutral fallback -> confidence 0.0 -> the engine
/// never places a trade. See `default_decision()` in `poly_ai::client` for the
/// canonical neutral values, which `Default` here mirrors.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradingDecision {
    #[serde(default = "default_side_bias", deserialize_with = "deserialize_side_bias")]
    pub side_bias: SideBias,
    #[serde(default, deserialize_with = "deserialize_confidence")]
    pub confidence: f32,
    #[serde(default)]
    pub bid_prices: BidPrices,
    #[serde(default)]
    pub reasoning: String,
}

fn default_side_bias() -> SideBias {
    SideBias::Neutral
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum SideBias {
    Bullish,
    Bearish,
    Neutral,
}

/// Lenient `SideBias` deserializer: accepts any case and common synonyms.
/// "bullish"/"bull"/"up"/"long" -> Bullish, "bearish"/"bear"/"down"/"short" -> Bearish,
/// anything else (incl. null/missing) -> Neutral.
fn deserialize_side_bias<'de, D: Deserializer<'de>>(de: D) -> Result<SideBias, D::Error> {
    let raw: Option<String> = Option::deserialize(de)?;
    Ok(match raw.as_deref().map(str::trim).map(str::to_ascii_lowercase) {
        Some(s) if ["bullish", "bull", "up", "long", "yes"].iter().any(|k| s == *k) => {
            SideBias::Bullish
        }
        Some(s) if ["bearish", "bear", "down", "short", "no"].iter().any(|k| s == *k) => {
            SideBias::Bearish
        }
        _ => SideBias::Neutral,
    })
}

/// Lenient `confidence` deserializer: accepts a JSON number, a numeric string,
/// or a qualitative word. Words map to mid-range confidences that clear the
/// engine's `> 0.1` order gate: low=0.3, medium=0.6, high=0.9. Unknown/empty -> 0.0.
fn deserialize_confidence<'de, D: Deserializer<'de>>(de: D) -> Result<f32, D::Error> {
    let value: serde_json::Value = Deserialize::deserialize(de)?;
    Ok(match value {
        serde_json::Value::Number(n) => n
            .as_f64()
            .map(|f| f as f32)
            .unwrap_or(0.0)
            .clamp(0.0, 1.0),
        serde_json::Value::String(s) => {
            let s = s.trim().to_ascii_lowercase();
            match s.as_str() {
                "low" => 0.3,
                "medium" | "med" | "moderate" => 0.6,
                "high" => 0.9,
                _ => s.parse::<f32>().unwrap_or(0.0).clamp(0.0, 1.0),
            }
        }
        _ => 0.0,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BidPrices {
    #[serde(default = "default_tick_price")]
    pub yes_price: Decimal,
    #[serde(default = "default_tick_price")]
    pub no_price: Decimal,
    #[serde(default = "default_size")]
    pub yes_size: Decimal,
    #[serde(default = "default_size")]
    pub no_size: Decimal,
}

fn default_tick_price() -> Decimal {
    Decimal::new(1, 2) // 0.01
}

fn default_size() -> Decimal {
    Decimal::from(10)
}

impl Default for BidPrices {
    fn default() -> Self {
        Self {
            yes_price: default_tick_price(),
            no_price: default_tick_price(),
            yes_size: default_size(),
            no_size: default_size(),
        }
    }
}

impl Default for TradingDecision {
    fn default() -> Self {
        Self {
            side_bias: SideBias::Neutral,
            confidence: 0.0,
            bid_prices: BidPrices::default(),
            reasoning: String::new(),
        }
    }
}

/// One chat message. Used for both outbound requests (content always `Some`)
/// and inbound responses, where `content` may be `null` (reasoning/tool-only
/// responses from Ollama) — hence `Option`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiMessage {
    pub role: String,
    #[serde(default)]
    pub content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiRequest {
    pub model: String,
    pub messages: Vec<AiMessage>,
    pub max_tokens: u32,
    pub temperature: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiResponse {
    pub choices: Vec<AiChoice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiChoice {
    pub message: AiMessage,
    /// Captured so truncation (`"length"`) is observable in logs rather than
    /// silently producing an empty/partial decision.
    #[serde(default)]
    pub finish_reason: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_clean_pascalcase_decision() {
        let d: TradingDecision = serde_json::from_str(
            r#"{"side_bias":"Bullish","confidence":0.8,"bid_prices":{"yes_price":"0.01","no_price":"0.01","yes_size":"10","no_size":"10"},"reasoning":"up"}"#,
        ).unwrap();
        assert_eq!(d.side_bias, SideBias::Bullish);
        assert!((d.confidence - 0.8).abs() < 1e-3);
    }

    #[test]
    fn parses_lowercase_side_and_word_confidence() {
        // gemma4:12b-style output: lowercase enum, qualitative confidence string.
        let d: TradingDecision = serde_json::from_str(
            r#"{"side_bias":"bearish","confidence":"medium","reasoning":"reversal"}"#,
        ).unwrap();
        assert_eq!(d.side_bias, SideBias::Bearish);
        assert!((d.confidence - 0.6).abs() < 1e-3, "medium -> 0.6, got {}", d.confidence);
        // bid_prices defaulted
        assert_eq!(d.bid_prices.yes_price, Decimal::new(1, 2));
    }

    #[test]
    fn parses_fenced_json_block_via_extract_in_client() {
        // The client's extract_json strips fences; here we verify a bare lowercase
        // 'neutral' with numeric confidence parses to Neutral.
        let d: TradingDecision = serde_json::from_str(
            r#"{"side_bias":"neutral","confidence":0.4}"#,
        ).unwrap();
        assert_eq!(d.side_bias, SideBias::Neutral);
    }

    #[test]
    fn tolerates_missing_fields() {
        let d: TradingDecision = serde_json::from_str(r#"{"reasoning":"only this"}"#).unwrap();
        assert_eq!(d.side_bias, SideBias::Neutral);
        assert_eq!(d.confidence, 0.0);
        assert_eq!(d.bid_prices.yes_size, Decimal::from(10));
    }

    #[test]
    fn response_tolerates_null_content_and_captures_finish_reason() {
        let resp: AiResponse =
            serde_json::from_str(r#"{"choices":[{"message":{"role":"assistant","content":null},"finish_reason":"length"}]}"#)
                .unwrap();
        assert_eq!(resp.choices[0].message.content, None);
        assert_eq!(resp.choices[0].finish_reason.as_deref(), Some("length"));
    }
}
