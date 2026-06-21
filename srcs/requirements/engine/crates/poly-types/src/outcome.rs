use serde::{Deserialize, Serialize};

/// One AI trading decision paired with its (eventually) reconciled outcome.
///
/// Inserted `Open` at decision time with only the decision + order-id columns.
/// The reconciler later fills the result columns and flips `status` to
/// `Reconciled` (or `Failed`). This is the learning signal: it joins the AI
/// decision to what actually happened, in a single queryable row.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeOutcome {
    pub id: Option<i64>,
    pub vault_id: String,
    pub run_id: String,
    pub market_id: String,

    // decision context (captured at quote time)
    pub decided_at: i64,
    pub ai_side_bias: Option<String>,
    pub ai_confidence: Option<f32>,
    pub ai_reasoning: Option<String>,
    pub decision_inputs: Option<serde_json::Value>,

    // the orders this decision produced
    pub yes_order_id: Option<String>,
    pub no_order_id: Option<String>,

    // result (filled by reconciliation)
    pub status: OutcomeStatus,
    pub yes_filled_qty: i32,
    pub no_filled_qty: i32,
    pub market_closed: Option<bool>,
    pub winning_side: Option<String>,
    pub realized_pnl: Option<f32>,
    pub pnl_detail: Option<serde_json::Value>,
    pub reconciled_at: Option<i64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum OutcomeStatus {
    Open,
    Reconciled,
    Failed,
}

impl OutcomeStatus {
    pub fn as_db_str(self) -> &'static str {
        match self {
            OutcomeStatus::Open => "OPEN",
            OutcomeStatus::Reconciled => "RECONCILED",
            OutcomeStatus::Failed => "FAILED",
        }
    }
}

pub fn parse_outcome_status(s: &str) -> OutcomeStatus {
    match s {
        "RECONCILED" => OutcomeStatus::Reconciled,
        "FAILED" => OutcomeStatus::Failed,
        _ => OutcomeStatus::Open,
    }
}
