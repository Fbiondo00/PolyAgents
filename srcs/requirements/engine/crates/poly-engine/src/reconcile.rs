//! Lagged reconciliation: turn OPEN `trade_outcomes` rows into RECONCILED ones
//! once the market resolves and fills are knowable.
//!
//! This is the second half of the feedback signal (Phase 1b). The hot loop
//! inserts an OPEN row at decision time; the reconciler, on a slower cadence,
//! closes those rows out: it asks Gamma whether the market closed, derives the
//! winning side from the resolved token prices, infers fills, computes realized
//! PnL, and writes the result. Nothing here runs inside `run_cycle` — it's a
//! separate spawned task so the hot path never blocks on market resolution.
//!
//! Fill inference (per the Phase 1 design decision):
//! - **Live** (`polymarket.live == true`): `get_order` is authoritative.
//! - **Simulated** (default): a passive bid at `p` is treated as filled if the
//!   market resolved — these are paper trades whose only purpose is to feed the
//!   learner, so we assume the bid crossed by expiry. The PnL formula is the
//!   same either way; only the fill source differs.

use std::sync::Arc;

use anyhow::Result;
use rust_decimal::Decimal;
use rust_decimal::prelude::ToPrimitive;

use poly_db::PgPool;
use poly_market::MarketAdapter;
use poly_market::PolymarketAdapter;
use poly_types::config::AppConfig;
use poly_types::outcome::TradeOutcome;

/// How long after a decision before its outcome is eligible for reconciliation.
/// A BTC "Up or Down" market resolves every 5 min; this lets one grace period
/// elapse so Gamma has caught up before we query resolution.
const RECONCILE_AGE_MS: i64 = 6 * 60 * 1000;

/// Reconcile cadence (seconds). Slow on purpose: markets resolve on a 5-min
/// cycle, so batched sweeps are more efficient than per-tick checks.
const RECONCILE_INTERVAL_SECS: u64 = 30;

pub struct Reconciler {
    pool: Arc<PgPool>,
    market: Arc<PolymarketAdapter>,
    config: Arc<AppConfig>,
}

impl Reconciler {
    pub fn new(config: Arc<AppConfig>, pool: Arc<PgPool>, market: Arc<PolymarketAdapter>) -> Self {
        Self { pool, market, config }
    }

    /// Spawn the reconciliation loop. Runs until the process exits; safe to
    /// `tokio::spawn` alongside the engine.
    pub fn spawn(self) {
        tokio::spawn(async move {
            tracing::info!(
                interval_secs = RECONCILE_INTERVAL_SECS,
                age_ms = RECONCILE_AGE_MS,
                "Reconciler loop started"
            );
            loop {
                if let Err(e) = self.sweep_all().await {
                    tracing::warn!(error = %e, "Reconciler sweep failed");
                }
                tokio::time::sleep(tokio::time::Duration::from_secs(RECONCILE_INTERVAL_SECS)).await;
            }
        });
    }

    /// One reconciliation pass: find every OPEN outcome old enough to be
    /// resolvable and attempt to close it.
    async fn sweep_all(&self) -> Result<()> {
        // We don't track per-vault OPEN ids centrally; pull distinct vaults with
        // outstanding OPENs and reconcile each.
        let vault_ids: Vec<(String,)> = sqlx::query_as(
            "SELECT DISTINCT vault_id FROM trade_outcomes WHERE status = 'OPEN'",
        )
        .fetch_all(self.pool.as_ref())
        .await?;

        for (vault_id,) in vault_ids {
            if let Err(e) = self.sweep_vault(&vault_id).await {
                tracing::warn!(vault_id = %vault_id, error = %e, "Reconcile vault failed");
            }
        }
        Ok(())
    }

    async fn sweep_vault(&self, vault_id: &str) -> Result<()> {
        let now = chrono::Utc::now().timestamp_millis();
        let open =
            poly_db::outcomes::get_open_older_than(self.pool.as_ref(), vault_id, RECONCILE_AGE_MS, now).await?;
        for outcome in open {
            if let Err(e) = self.reconcile_one(&outcome).await {
                tracing::warn!(
                    outcome_id = ?outcome.id,
                    market_id = %outcome.market_id,
                    error = %e,
                    "Reconcile one failed"
                );
            }
        }
        Ok(())
    }

    /// Reconcile a single outcome: resolve the market, infer fills, compute
    /// PnL, and persist the result. Idempotent — only acts on OPEN rows.
    async fn reconcile_one(&self, outcome: &TradeOutcome) -> Result<()> {
        let Some(id) = outcome.id else { return Ok(()) };

        // Gamma is the source of truth for resolution. The market id we stored
        // is the Gamma conditionId / market id used by get_market.
        let market = match self.market.get_market(&outcome.market_id).await {
            Ok(m) => m,
            Err(e) => {
                tracing::warn!(market_id = %outcome.market_id, error = %e, "get_market failed; deferring");
                return Ok(());
            }
        };

        if !market.closed {
            // Not resolved yet; leave OPEN for a future sweep.
            return Ok(());
        }

        // Winning side from resolved token prices: a binary market pays $1 to
        // the winning outcome, $0 to the loser. The token whose price rounds to
        // 1 wins; if neither is cleanly 1 (e.g. tie / still resolving), defer.
        let winning_side = match derive_winning_side(&market.tokens.iter().map(|t| t.price).collect::<Vec<_>>()) {
            Some(s) => s,
            None => {
                tracing::debug!(market_id = %market.id, "Market closed but no clean winner yet; deferring");
                return Ok(());
            }
        };

        let (yes_buy, no_buy) = read_buy_prices(&outcome.decision_inputs);
        let (yes_filled, no_filled) = self.infer_fills(outcome).await;

        let pnl = compute_pnl(
            winning_side.as_str(),
            yes_filled,
            no_filled,
            yes_buy,
            no_buy,
        );

        let pnl_detail = serde_json::json!({
            "winning_side": winning_side,
            "yes_filled": yes_filled,
            "no_filled": no_filled,
            "yes_buy_price": yes_buy.to_string(),
            "no_buy_price": no_buy.to_string(),
            "pnl": format!("{:.4}", pnl),
            "live": self.config.polymarket.live,
        });

        let now = chrono::Utc::now().timestamp_millis();
        poly_db::outcomes::mark_reconciled(
            self.pool.as_ref(),
            id,
            yes_filled,
            no_filled,
            true,
            Some(&winning_side),
            Some(pnl),
            Some(&pnl_detail),
            now,
        )
        .await?;

        tracing::info!(
            outcome_id = id,
            market_id = %outcome.market_id,
            winning_side = %winning_side,
            pnl = %format!("{:.4}", pnl),
            "Outcome reconciled"
        );
        Ok(())
    }

    /// Determine fill quantities for the YES/NO orders of an outcome.
    /// Live: ask the CLOB. Simulated: assume the passive bid crossed (the bid
    /// is at $0.01; resolution implies the book moved through it). Fill size
    /// comes from the decision inputs the orders were placed with.
    async fn infer_fills(&self, outcome: &TradeOutcome) -> (i32, i32) {
        let (yes_size, no_size) = read_order_sizes(&outcome.decision_inputs);

        if !self.config.polymarket.live {
            return (yes_size, no_size);
        }

        // Live: only count an order as filled if get_order confirms it.
        let yes_filled = match outcome.yes_order_id.as_deref() {
            Some(oid) => filled_qty_for(self.market.get_order(oid).await, yes_size),
            None => 0,
        };
        let no_filled = match outcome.no_order_id.as_deref() {
            Some(oid) => filled_qty_for(self.market.get_order(oid).await, no_size),
            None => 0,
        };
        (yes_filled, no_filled)
    }
}

/// Map a `get_order` result into a filled quantity. The CLOB reports
/// `size_matched` (cumulative fills); we clamp to the order's intended size so
/// a stale live order can't report more than we asked for.
fn filled_qty_for(res: Result<poly_market::clob::OrderState>, intended: i32) -> i32 {
    match res {
        Ok(state) => {
            let matched = state
                .size_matched
                .to_i32()
                .unwrap_or(0)
                .clamp(0, intended.max(0));
            if matched > 0 {
                matched
            } else {
                // Status string carries the signal when size_matched is 0.
                if matches!(state.status.as_str(), "matched" | "filled") {
                    intended.max(0)
                } else {
                    0
                }
            }
        }
        Err(_) => 0,
    }
}

/// Derive the winning side ("YES" / "NO") from resolved token prices. The first
/// token is YES, the second is NO (the discover/quote split enforces binary
/// markets). Returns None if no price cleanly indicates a winner (e.g. prices
/// still 0.5/0.5 mid-resolution).
fn derive_winning_side(prices: &[Decimal]) -> Option<String> {
    let one = Decimal::ONE;
    let yes_won = prices.first().map(|p| p >= &one).unwrap_or(false);
    let no_won = prices.get(1).map(|p| p >= &one).unwrap_or(false);
    match (yes_won, no_won) {
        (true, false) => Some("YES".to_string()),
        (false, true) => Some("NO".to_string()),
        _ => None,
    }
}

/// PnL for a both-side passive bid after resolution. Each side bought at its
/// bid price; the winning side pays $1/unit, the losing side pays $0.
/// PnL = yes_filled * (1 - yes_buy) + no_filled * (0 - no_buy).
fn compute_pnl(
    winning_side: &str,
    yes_filled: i32,
    no_filled: i32,
    yes_buy: Decimal,
    no_buy: Decimal,
) -> f32 {
    let one = Decimal::ONE;
    let zero = Decimal::ZERO;
    let yes_settle = if winning_side == "YES" { one } else { zero };
    let no_settle = if winning_side == "NO" { one } else { zero };

    let yes_pnl = Decimal::from(yes_filled.max(0)) * (yes_settle - yes_buy);
    let no_pnl = Decimal::from(no_filled.max(0)) * (no_settle - no_buy);
    (yes_pnl + no_pnl).to_f32().unwrap_or(0.0)
}

/// Extract the YES/NO bid prices recorded at decision time. Defaults to the
/// strategy's canonical $0.01 if the JSONB is missing or malformed.
fn read_buy_prices(inputs: &Option<serde_json::Value>) -> (Decimal, Decimal) {
    let one_cent = Decimal::new(1, 2); // 0.01
    let parse = |key: &str| -> Decimal {
        inputs
            .as_ref()
            .and_then(|v| v.get(key))
            .and_then(|p| p.as_str())
            .and_then(|s| s.parse::<Decimal>().ok())
            .unwrap_or(one_cent)
    };
    (parse("yes_price"), parse("no_price"))
}

/// Extract the intended YES/NO order sizes recorded at decision time.
fn read_order_sizes(inputs: &Option<serde_json::Value>) -> (i32, i32) {
    let parse = |key: &str| -> i32 {
        inputs
            .as_ref()
            .and_then(|v| v.get(key))
            .and_then(|p| p.as_str())
            .and_then(|s| s.parse::<i32>().ok().or_else(|| s.parse::<f64>().ok().map(|f| f as i32)))
            .unwrap_or(0)
    };
    (parse("yes_size"), parse("no_size"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal::Decimal;
    use std::str::FromStr;

    fn d(s: &str) -> Decimal {
        Decimal::from_str(s).unwrap()
    }

    #[test]
    fn pnl_both_filled_yes_wins() {
        // Buy YES + NO at $0.01, both fill, market resolves YES.
        // YES: 100 * (1 - 0.01) = 99 ; NO: 100 * (0 - 0.01) = -1 ; net = 98.
        let pnl = compute_pnl("YES", 100, 100, d("0.01"), d("0.01"));
        assert!((pnl - 98.0).abs() < 1e-6, "got {pnl}");
    }

    #[test]
    fn pnl_both_filled_no_wins() {
        let pnl = compute_pnl("NO", 100, 100, d("0.01"), d("0.01"));
        assert!((pnl - 98.0).abs() < 1e-6, "got {pnl}");
    }

    #[test]
    fn pnl_only_yes_filled_yes_wins() {
        // YES fills, NO doesn't, market resolves YES.
        // YES: 100 * 0.99 = 99 ; NO: 0 ; net = 99.
        let pnl = compute_pnl("YES", 100, 0, d("0.01"), d("0.01"));
        assert!((pnl - 99.0).abs() < 1e-6, "got {pnl}");
    }

    #[test]
    fn pnl_yes_filled_but_loses() {
        // YES fills, market resolves NO → YES worthless.
        // YES: 100 * (0 - 0.01) = -1 ; net = -1 (just the premium lost).
        let pnl = compute_pnl("NO", 100, 0, d("0.01"), d("0.01"));
        assert!((pnl + 1.0).abs() < 1e-6, "got {pnl}");
    }

    #[test]
    fn winning_side_from_prices() {
        assert_eq!(derive_winning_side(&[d("1"), d("0")]).as_deref(), Some("YES"));
        assert_eq!(derive_winning_side(&[d("0"), d("1")]).as_deref(), Some("NO"));
        assert_eq!(derive_winning_side(&[d("0.5"), d("0.5")]), None, "mid-resolution → defer");
        assert_eq!(derive_winning_side(&[d("0"), d("0")]), None, "no winner → defer");
    }

    #[test]
    fn read_buy_prices_defaults_to_one_cent() {
        let (y, n) = read_buy_prices(&None);
        assert_eq!(y, d("0.01"));
        assert_eq!(n, d("0.01"));

        let inputs = serde_json::json!({"yes_price": "0.02", "no_price": "0.01"});
        let (y, n) = read_buy_prices(&Some(inputs));
        assert_eq!(y, d("0.02"));
        assert_eq!(n, d("0.01"));
    }
}
