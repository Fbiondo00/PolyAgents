use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Vault {
    pub id: String,
    pub name: String,
    pub wallet_address: Option<String>,
    pub strategy: serde_json::Value,
    pub funding: serde_json::Value,
    pub inventory: serde_json::Value,
    pub stats: serde_json::Value,
    pub mode: VaultMode,
    pub token_balance: i32,
    pub active_market: Option<serde_json::Value>,
    pub sparkline: Option<serde_json::Value>,
    pub created: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum VaultMode {
    Auto,
    #[default]
    Advisory,
}

impl std::fmt::Display for VaultMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Auto => write!(f, "auto"),
            Self::Advisory => write!(f, "advisory"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultStats {
    pub total_pnl: Decimal,
    pub total_trades: i32,
    pub win_rate: Decimal,
    pub active_cycles: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrategyConfig {
    pub vault_id: String,
    pub enabled: bool,
    pub entry_price: f32,
    pub exit_price: f32,
    pub order_size: i32,
    pub max_capital_usdc: Option<f32>,
    pub max_trades_per_market: i32,
    pub max_trades_policy: String,
    pub no_new_entries_last_seconds: i32,
    pub keep_sell_orders_after_expiry_seconds: i32,
    pub reconcile_interval_cycles: i32,
    pub min_spread_required: Option<f32>,
    pub strict_passive_only: bool,
    pub allow_both_sides: bool,
    pub cancel_open_buys_on_expiry: bool,
    pub auto_reentry_enabled: bool,
    pub max_drawdown_usdc: f32,
}

impl Default for StrategyConfig {
    fn default() -> Self {
        Self {
            vault_id: String::new(),
            enabled: true,
            entry_price: 0.20,
            exit_price: 0.25,
            order_size: 10,
            max_capital_usdc: None,
            max_trades_per_market: 1,
            max_trades_policy: "side".into(),
            no_new_entries_last_seconds: 10,
            keep_sell_orders_after_expiry_seconds: 10,
            reconcile_interval_cycles: 8,
            min_spread_required: None,
            strict_passive_only: true,
            allow_both_sides: true,
            cancel_open_buys_on_expiry: true,
            auto_reentry_enabled: false,
            max_drawdown_usdc: 50.0,
        }
    }
}
