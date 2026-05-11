use schemars::JsonSchema;
use serde::Deserialize;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct VaultIdParams {
    /// The vault ID
    pub vault_id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct VaultLimitParams {
    /// The vault ID
    pub vault_id: String,
    /// Maximum number of records to return (default 100)
    #[serde(default)]
    pub limit: Option<u32>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CreateVaultParams {
    /// Vault name
    #[serde(default)]
    pub name: Option<String>,
    /// Wallet address
    #[serde(default)]
    pub wallet_address: Option<String>,
    /// Strategy configuration as JSON object
    #[serde(default)]
    pub strategy: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct UpdateConfigParams {
    /// The vault ID to update
    pub vault_id: String,
    /// Whether the strategy is enabled
    #[serde(default)]
    pub enabled: Option<bool>,
    /// Entry (bid) price in USDC
    #[serde(default)]
    pub entry_price: Option<f32>,
    /// Exit (ask) price in USDC
    #[serde(default)]
    pub exit_price: Option<f32>,
    /// Order size in units
    #[serde(default)]
    pub order_size: Option<i32>,
    /// Maximum capital in USDC
    #[serde(default)]
    pub max_capital_usdc: Option<f32>,
    /// Maximum trades per market
    #[serde(default)]
    pub max_trades_per_market: Option<i32>,
    /// Policy for max trades: "side" or "total"
    #[serde(default)]
    pub max_trades_policy: Option<String>,
    /// Seconds before expiry to stop new entries
    #[serde(default)]
    pub no_new_entries_last_seconds: Option<i32>,
    /// Seconds to keep sell orders after expiry
    #[serde(default)]
    pub keep_sell_orders_after_expiry_seconds: Option<i32>,
    /// Reconcile every N cycles
    #[serde(default)]
    pub reconcile_interval_cycles: Option<i32>,
    /// Minimum spread required
    #[serde(default)]
    pub min_spread_required: Option<f32>,
    /// Only allow passive (maker) orders
    #[serde(default)]
    pub strict_passive_only: Option<bool>,
    /// Allow placing bids on both sides
    #[serde(default)]
    pub allow_both_sides: Option<bool>,
    /// Cancel open buy orders near expiry
    #[serde(default)]
    pub cancel_open_buys_on_expiry: Option<bool>,
    /// Auto re-enter after cycle completes
    #[serde(default)]
    pub auto_reentry_enabled: Option<bool>,
    /// Maximum drawdown in USDC before stopping
    #[serde(default)]
    pub max_drawdown_usdc: Option<f32>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct WithdrawParams {
    /// The vault ID to withdraw from
    pub vault_id: String,
    /// Recipient address to receive USDC
    pub recipient: String,
    /// Amount in USDC to withdraw
    pub amount: String,
}
