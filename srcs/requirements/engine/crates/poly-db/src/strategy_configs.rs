use anyhow::Result;
use sqlx::PgPool;

use poly_types::vault::StrategyConfig;

pub async fn upsert(pool: &PgPool, config: &StrategyConfig) -> Result<()> {
    sqlx::query(
        "INSERT INTO strategy_configs (vault_id, enabled, entry_price, exit_price, order_size,
         max_capital_usdc, max_trades_per_market, max_trades_policy,
         no_new_entries_last_seconds, keep_sell_orders_after_expiry_seconds,
         reconcile_interval_cycles, min_spread_required, strict_passive_only,
         allow_both_sides, cancel_open_buys_on_expiry, auto_reentry_enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         ON CONFLICT (vault_id) DO UPDATE SET
           enabled = $2, entry_price = $3, exit_price = $4, order_size = $5,
           max_capital_usdc = $6, max_trades_per_market = $7, max_trades_policy = $8,
           no_new_entries_last_seconds = $9, keep_sell_orders_after_expiry_seconds = $10,
           reconcile_interval_cycles = $11, min_spread_required = $12, strict_passive_only = $13,
           allow_both_sides = $14, cancel_open_buys_on_expiry = $15, auto_reentry_enabled = $16"
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
    .execute(pool)
    .await?;
    Ok(())
}
