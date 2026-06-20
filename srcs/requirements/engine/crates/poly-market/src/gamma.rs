use anyhow::Result;
use reqwest::Client;
use rust_decimal::Decimal;

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

    /// Discover a tradable binary market, preferring "Bitcoin Up or Down".
    ///
    /// The Gamma `/markets` endpoint does not honor a `question`/`tag` filter
    /// for these recurring BTC markets — `tag=bitcoin` returns unrelated
    /// "before GTA VI" markets. We pull active markets ordered by 24h volume
    /// descending (live, liquid markets with existing order books) and filter
    /// client-side for binary markets (exactly two CLOB tokens) whose
    /// `endDate` is still in the future. Expired BTC Up/Down markets linger
    /// flagged `active`/`closed=false` but have no order book, so an
    /// `endDate`-ascending sort would surface dead markets and the cycle
    /// would loop on a CLOB 404.
    pub async fn search_markets(&self, params: MarketParams) -> Result<Market> {
        let resp: serde_json::Value = self
            .http
            .get(format!("{}/markets", self.base_url))
            .query(&[
                ("active", "true"),
                ("closed", "false"),
                ("order", "volume24hr"),
                ("ascending", "false"),
                ("limit", "100"),
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

        let now_ms = chrono::Utc::now().timestamp_millis();

        // Prefer BTC Up/Down markets; fall back to any binary market so the
        // caller still gets something tradeable when the BTC series is dark.
        let query = params.query.to_lowercase();
        let wants_btc = query.contains("bitcoin") || query.contains("btc");

        let mut best: Option<(&serde_json::Value, (u8, i64, f64))> = None;
        for m in markets {
            // Skip non-binary markets outright: the cycle needs YES + NO tokens.
            if token_count(m) != Some(2) {
                continue;
            }
            // Skip expired markets: their order book no longer exists.
            if let Some(end_ms) = parse_end_date_ms(m)
                && end_ms < now_ms
            {
                continue;
            }
            let score = market_score(m, wants_btc, now_ms);
            match &best {
                None => best = Some((m, score)),
                Some((_, bs)) if score < *bs => best = Some((m, score)),
                _ => {}
            }
        }

        let market = best
            .map(|(m, _)| m)
            .ok_or_else(|| anyhow::anyhow!("No active binary market with a live book found"))?;

        parse_market(market)
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

        parse_market(&resp)
    }
}

/// Tier + tiebreak score for picking the best market. Lower is better.
///
/// * Tier 0 — a "Bitcoin Up or Down" market (the strategy's target).
/// * Tier 1 — any market whose question mentions the query term.
/// * Tier 2 — anything else.
///
/// Within a tier, higher 24h volume wins (more liquid → tighter book). Volume
/// is stored negated so the `min_by` ordering picks the highest.
fn market_score(m: &serde_json::Value, wants_btc: bool, _now_ms: i64) -> (u8, i64, f64) {
    let question = m["question"].as_str().unwrap_or("").to_lowercase();
    let is_btc_updown = question.contains("bitcoin up or down");
    let tier = if is_btc_updown {
        0
    } else if wants_btc && (question.contains("bitcoin") || question.contains("btc")) {
        1
    } else {
        2
    };

    let volume = m["volume24hr"]
        .as_f64()
        .or_else(|| m["volume24hrClob"].as_f64())
        .unwrap_or(0.0);
    (tier, 0, -volume)
}

/// Number of CLOB tokens a Gamma market exposes. Returns None if the
/// `clobTokenIds` field is missing or malformed.
fn token_count(m: &serde_json::Value) -> Option<usize> {
    let ids = decode_string_array(&m["clobTokenIds"]);
    if ids.is_empty() && !m["clobTokenIds"].is_string() && !m["clobTokenIds"].is_array() {
        return None;
    }
    Some(ids.len())
}

/// Parse Gamma's `endDate` (e.g. "2026-06-21T16:40:00Z") into epoch millis.
/// Returns None if absent or unparseable.
fn parse_end_date_ms(m: &serde_json::Value) -> Option<i64> {
    let s = m["endDate"].as_str().or_else(|| m["endDateIso"].as_str())?;
    chrono::DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|dt| dt.timestamp_millis())
}

/// Parse a Gamma market object into our [`Market`] type.
///
/// Gamma encodes the two CLOB tokens across three JSON-string fields rather
/// than a `tokens` array: `outcomes` (`["Yes","No"]`), `clobTokenIds`
/// (`["<id>","<id>"]`), and `outcomePrices` (`["0.5","0.5"]`). We zipped them
/// index-wise; a token is kept only if it has both an id and an outcome.
fn parse_market(v: &serde_json::Value) -> Result<Market> {
    let tokens = build_tokens(v);

    Ok(Market {
        id: v["id"].as_str().unwrap_or("").into(),
        question: v["question"].as_str().unwrap_or("").into(),
        condition_id: v["conditionId"]
            .as_str()
            .or_else(|| v["condition_id"].as_str())
            .unwrap_or("")
            .into(),
        slug: v["slug"].as_str().unwrap_or("").into(),
        active: v["active"].as_bool().unwrap_or(false),
        closed: v["closed"].as_bool().unwrap_or(true),
        end_date: v["endDate"]
            .as_str()
            .or_else(|| v["end_date"].as_str())
            .map(String::from),
        tokens,
    })
}

/// Decode Gamma's parallel JSON-string token fields into [`Token`]s.
fn build_tokens(v: &serde_json::Value) -> Vec<Token> {
    let ids: Vec<String> = decode_string_array(&v["clobTokenIds"]);
    let outcomes: Vec<String> = decode_string_array(&v["outcomes"]);
    let prices: Vec<String> = decode_string_array(&v["outcomePrices"]);

    ids.iter()
        .enumerate()
        .filter_map(|(i, id)| {
            if id.is_empty() {
                return None;
            }
            let outcome = outcomes.get(i).cloned().unwrap_or_default();
            let price = prices
                .get(i)
                .and_then(|p| p.parse::<Decimal>().ok())
                .unwrap_or(Decimal::ZERO);
            Some(Token {
                token_id: id.clone(),
                outcome,
                price,
            })
        })
        .collect()
}

/// Gamma returns array-typed fields as JSON-encoded strings
/// (e.g. `"[\"Yes\", \"No\"]"`). Decode such a value into `Vec<String>`,
/// tolerating either the string-encoded form or a real JSON array.
fn decode_string_array(v: &serde_json::Value) -> Vec<String> {
    let arr = match v {
        serde_json::Value::String(s) => serde_json::from_str::<Vec<String>>(s).unwrap_or_default(),
        serde_json::Value::Array(_) => serde_json::from_str::<Vec<String>>(
            &v.to_string(),
        )
        .unwrap_or_default(),
        _ => Vec::new(),
    };
    arr.into_iter().map(|s| s.trim().to_string()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn btc_market_json() -> serde_json::Value {
        serde_json::json!({
            "id": "964335",
            "question": "Bitcoin Up or Down - December 19, 11:35AM-11:40AM ET",
            "conditionId": "0xabc",
            "slug": "bitcoin-up-or-down-dec-19",
            "active": true,
            "closed": false,
            "endDate": "2026-06-21T16:40:00Z",
            "outcomes": "[\"Up\", \"Down\"]",
            "clobTokenIds": "[\"111\", \"222\"]",
            "outcomePrices": "[\"0.50\", \"0.50\"]"
        })
    }

    #[test]
    fn parse_market_decodes_two_tokens_from_string_fields() {
        let market = parse_market(&btc_market_json()).expect("parse");
        assert_eq!(market.tokens.len(), 2);
        assert_eq!(market.tokens[0].token_id, "111");
        assert_eq!(market.tokens[0].outcome, "Up");
        assert_eq!(market.tokens[1].token_id, "222");
        assert_eq!(market.tokens[1].outcome, "Down");
        assert_eq!(market.end_date.as_deref(), Some("2026-06-21T16:40:00Z"));
        assert_eq!(market.condition_id, "0xabc");
    }

    #[test]
    fn decode_string_array_handles_real_array_and_string() {
        let from_str = decode_string_array(&serde_json::json!("[\"Yes\", \"No\"]"));
        assert_eq!(from_str, vec!["Yes".to_string(), "No".to_string()]);

        let from_arr = decode_string_array(&serde_json::json!(["A", "B"]));
        assert_eq!(from_arr, vec!["A".to_string(), "B".to_string()]);
    }

    #[test]
    fn market_score_ranks_btc_updown_first() {
        let now = chrono::Utc::now().timestamp_millis();
        let btc = btc_market_json();
        // Generic BTC market with higher volume still ranks below Up/Down
        // because tier 0 beats tier 1 regardless of volume.
        let other = serde_json::json!({
            "question": "Will bitcoin hit $1m?",
            "endDate": "2030-01-01T00:00:00Z",
            "volume24hr": 999_999_999.0
        });
        let score_btc = market_score(&btc, true, now);
        let score_other = market_score(&other, true, now);
        assert!(score_btc < score_other, "btc up/down must outrank generic");
        assert_eq!(score_btc.0, 0);
        assert_eq!(score_other.0, 1);
    }

    #[test]
    fn token_count_reads_clob_token_ids() {
        assert_eq!(
            token_count(&serde_json::json!({"clobTokenIds": "[\"1\", \"2\"]"})),
            Some(2)
        );
        assert_eq!(token_count(&serde_json::json!({"clobTokenIds": "[\"1\"]"})), Some(1));
        assert_eq!(token_count(&serde_json::json!({})), None);
    }

    #[test]
    fn parse_end_date_ms_handles_iso8601() {
        let m = serde_json::json!({"endDate": "2030-01-01T00:00:00Z"});
        assert!(parse_end_date_ms(&m).is_some());
        assert_eq!(parse_end_date_ms(&serde_json::json!({})), None);
    }
}
