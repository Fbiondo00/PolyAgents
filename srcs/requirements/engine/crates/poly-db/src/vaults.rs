use anyhow::Result;
use sqlx::PgPool;

use poly_types::vault::{StrategyConfig, Vault, VaultMode};

pub async fn get_all(pool: &PgPool) -> Result<Vec<Vault>> {
    let rows = sqlx::query_as::<_, VaultRow>(
        "SELECT id, name, wallet_address, strategy, funding, inventory,
         stats, mode, token_balance, active_market, sparkline, created
         FROM vaults ORDER BY created DESC"
    )
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(|r| r.into_vault()).collect())
}

pub async fn get_by_id(pool: &PgPool, id: &str) -> Result<Option<Vault>> {
    let row = sqlx::query_as::<_, VaultRow>(
        "SELECT id, name, wallet_address, strategy, funding, inventory,
         stats, mode, token_balance, active_market, sparkline, created
         FROM vaults WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| r.into_vault()))
}

pub async fn insert(pool: &PgPool, vault: &Vault) -> Result<()> {
    sqlx::query(
        "INSERT INTO vaults (id, name, wallet_address, strategy, funding, inventory,
         stats, mode, token_balance, active_market, sparkline, created)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)"
    )
    .bind(&vault.id)
    .bind(&vault.name)
    .bind(&vault.wallet_address)
    .bind(&vault.strategy)
    .bind(&vault.funding)
    .bind(&vault.inventory)
    .bind(&vault.stats)
    .bind(vault.mode.to_string())
    .bind(vault.token_balance)
    .bind(&vault.active_market)
    .bind(&vault.sparkline)
    .bind(vault.created)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn update(pool: &PgPool, vault: &Vault) -> Result<()> {
    sqlx::query(
        "UPDATE vaults SET name = $2, wallet_address = $3, strategy = $4,
         funding = $5, inventory = $6, stats = $7, mode = $8,
         token_balance = $9, active_market = $10, sparkline = $11
         WHERE id = $1"
    )
    .bind(&vault.id)
    .bind(&vault.name)
    .bind(&vault.wallet_address)
    .bind(&vault.strategy)
    .bind(&vault.funding)
    .bind(&vault.inventory)
    .bind(&vault.stats)
    .bind(vault.mode.to_string())
    .bind(vault.token_balance)
    .bind(&vault.active_market)
    .bind(&vault.sparkline)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn delete(pool: &PgPool, id: &str) -> Result<()> {
    sqlx::query("DELETE FROM vaults WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn upsert_strategy(pool: &PgPool, config: &StrategyConfig) -> Result<()> {
    sqlx::query(
        "INSERT INTO strategy_configs (
            vault_id, enabled, entry_price, exit_price, order_size,
            max_capital_usdc, max_trades_per_market, max_trades_policy,
            no_new_entries_last_seconds, keep_sell_orders_after_expiry_seconds,
            reconcile_interval_cycles, min_spread_required, strict_passive_only,
            allow_both_sides, cancel_open_buys_on_expiry, auto_reentry_enabled,
            max_drawdown_usdc
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (vault_id) DO UPDATE SET
            enabled=EXCLUDED.enabled, entry_price=EXCLUDED.entry_price,
            exit_price=EXCLUDED.exit_price, order_size=EXCLUDED.order_size,
            max_capital_usdc=EXCLUDED.max_capital_usdc,
            max_trades_per_market=EXCLUDED.max_trades_per_market,
            max_trades_policy=EXCLUDED.max_trades_policy,
            no_new_entries_last_seconds=EXCLUDED.no_new_entries_last_seconds,
            keep_sell_orders_after_expiry_seconds=EXCLUDED.keep_sell_orders_after_expiry_seconds,
            reconcile_interval_cycles=EXCLUDED.reconcile_interval_cycles,
            min_spread_required=EXCLUDED.min_spread_required,
            strict_passive_only=EXCLUDED.strict_passive_only,
            allow_both_sides=EXCLUDED.allow_both_sides,
            cancel_open_buys_on_expiry=EXCLUDED.cancel_open_buys_on_expiry,
            auto_reentry_enabled=EXCLUDED.auto_reentry_enabled,
            max_drawdown_usdc=EXCLUDED.max_drawdown_usdc"
    )
    .bind(&config.vault_id)
    .bind(config.enabled)
    .bind(config.entry_price)
    .bind(config.exit_price)
    .bind(config.order_size)
    .bind(config.max_capital_usdc)
    .bind(config.max_trades_per_market)
    .bind(&config.max_trades_policy)
    .bind(config.no_new_entries_last_seconds)
    .bind(config.keep_sell_orders_after_expiry_seconds)
    .bind(config.reconcile_interval_cycles)
    .bind(config.min_spread_required)
    .bind(config.strict_passive_only)
    .bind(config.allow_both_sides)
    .bind(config.cancel_open_buys_on_expiry)
    .bind(config.auto_reentry_enabled)
    .bind(config.max_drawdown_usdc)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_strategy_config(pool: &PgPool, vault_id: &str) -> Result<Option<StrategyConfig>> {
    let row = sqlx::query_as::<_, StrategyConfigRow>(
        "SELECT vault_id, enabled, entry_price, exit_price, order_size,
         max_capital_usdc, max_trades_per_market, max_trades_policy,
         no_new_entries_last_seconds, keep_sell_orders_after_expiry_seconds,
         reconcile_interval_cycles, min_spread_required, strict_passive_only,
         allow_both_sides, cancel_open_buys_on_expiry, auto_reentry_enabled,
         COALESCE(max_drawdown_usdc, 50.0) as max_drawdown_usdc
         FROM strategy_configs WHERE vault_id = $1"
    )
    .bind(vault_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| r.into_config()))
}

#[derive(sqlx::FromRow)]
struct VaultRow {
    id: String,
    name: String,
    wallet_address: Option<String>,
    strategy: serde_json::Value,
    funding: serde_json::Value,
    inventory: serde_json::Value,
    stats: serde_json::Value,
    mode: String,
    token_balance: i32,
    active_market: Option<serde_json::Value>,
    sparkline: Option<serde_json::Value>,
    created: i64,
}

impl VaultRow {
    fn into_vault(self) -> Vault {
        Vault {
            id: self.id,
            name: self.name,
            wallet_address: self.wallet_address,
            strategy: self.strategy,
            funding: self.funding,
            inventory: self.inventory,
            stats: self.stats,
            mode: match self.mode.as_str() {
                "auto" => VaultMode::Auto,
                _ => VaultMode::Advisory,
            },
            token_balance: self.token_balance,
            active_market: self.active_market,
            sparkline: self.sparkline,
            created: self.created,
        }
    }
}

#[derive(sqlx::FromRow)]
struct StrategyConfigRow {
    vault_id: String,
    enabled: bool,
    entry_price: f32,
    exit_price: f32,
    order_size: i32,
    max_capital_usdc: Option<f32>,
    max_trades_per_market: i32,
    max_trades_policy: String,
    no_new_entries_last_seconds: i32,
    keep_sell_orders_after_expiry_seconds: i32,
    reconcile_interval_cycles: i32,
    min_spread_required: Option<f32>,
    strict_passive_only: bool,
    allow_both_sides: bool,
    cancel_open_buys_on_expiry: bool,
    auto_reentry_enabled: bool,
    max_drawdown_usdc: f32,
}

impl StrategyConfigRow {
    fn into_config(self) -> StrategyConfig {
        StrategyConfig {
            vault_id: self.vault_id,
            enabled: self.enabled,
            entry_price: self.entry_price,
            exit_price: self.exit_price,
            order_size: self.order_size,
            max_capital_usdc: self.max_capital_usdc,
            max_trades_per_market: self.max_trades_per_market,
            max_trades_policy: self.max_trades_policy,
            no_new_entries_last_seconds: self.no_new_entries_last_seconds,
            keep_sell_orders_after_expiry_seconds: self.keep_sell_orders_after_expiry_seconds,
            reconcile_interval_cycles: self.reconcile_interval_cycles,
            min_spread_required: self.min_spread_required,
            strict_passive_only: self.strict_passive_only,
            allow_both_sides: self.allow_both_sides,
            cancel_open_buys_on_expiry: self.cancel_open_buys_on_expiry,
            auto_reentry_enabled: self.auto_reentry_enabled,
            max_drawdown_usdc: self.max_drawdown_usdc,
        }
    }
}
