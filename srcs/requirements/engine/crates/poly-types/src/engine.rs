use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum EngineState {
    Idle,
    DiscoveringMarket,
    Ready,
    Quoting,
    HoldingInventory,
    ExpiryGuard,
    RollingOver,
    Reconciling,
}

impl std::fmt::Display for EngineState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Idle => write!(f, "IDLE"),
            Self::DiscoveringMarket => write!(f, "DISCOVERING_MARKET"),
            Self::Ready => write!(f, "READY"),
            Self::Quoting => write!(f, "QUOTING"),
            Self::HoldingInventory => write!(f, "HOLDING_INVENTORY"),
            Self::ExpiryGuard => write!(f, "EXPIRY_GUARD"),
            Self::RollingOver => write!(f, "ROLLING_OVER"),
            Self::Reconciling => write!(f, "RECONCILING"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EngineRunStatus {
    Running,
    Stopped,
    Error,
}

impl std::fmt::Display for EngineRunStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Running => write!(f, "running"),
            Self::Stopped => write!(f, "stopped"),
            Self::Error => write!(f, "error"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineRun {
    pub id: String,
    pub vault_id: String,
    pub status: EngineRunStatus,
    pub current_state: EngineState,
    pub active_market_id: Option<String>,
    pub started_at: i64,
    pub stopped_at: Option<i64>,
    pub last_heartbeat_at: i64,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedBooks {
    pub vault_id: String,
    pub books: serde_json::Value,
    pub updated_at: i64,
}
