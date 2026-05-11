use rust_decimal::Decimal;

use poly_types::order::NewOrder;
use poly_types::vault::StrategyConfig;

const MAX_PRICE: Decimal = Decimal::from_parts(50, 0, 0, false, 2); // 0.50
const PASSIVE_MAX_PRICE: Decimal = Decimal::from_parts(1, 0, 0, false, 2); // 0.01

pub struct RiskEngine;

impl RiskEngine {
    pub fn validate_order(order: &NewOrder, config: &StrategyConfig) -> Result<(), RiskError> {
        if order.price > MAX_PRICE {
            return Err(RiskError::PriceTooHigh {
                max: MAX_PRICE,
                actual: order.price,
            });
        }

        if !config.enabled {
            return Err(RiskError::StrategyDisabled);
        }

        if config.strict_passive_only && order.price > PASSIVE_MAX_PRICE {
            return Err(RiskError::NotPassive {
                max: PASSIVE_MAX_PRICE,
                actual: order.price,
            });
        }

        if !config.allow_both_sides {
            // Only allow single-side orders — for passive market-making,
            // both sides are required, so this blocks if misconfigured
            return Err(RiskError::BothSidesBlocked);
        }

        Ok(())
    }

    pub fn should_cancel_at_expiry(
        config: &StrategyConfig,
        seconds_to_expiry: i64,
    ) -> bool {
        config.cancel_open_buys_on_expiry
            && seconds_to_expiry <= config.no_new_entries_last_seconds as i64
    }

    pub fn check_max_trades(open_order_count: usize, max_per_market: i32) -> Result<(), RiskError> {
        if open_order_count >= max_per_market as usize {
            return Err(RiskError::MaxTradesExceeded);
        }
        Ok(())
    }

    pub fn check_max_capital(open_notional: f64, max_usdc: f64) -> Result<(), RiskError> {
        if open_notional >= max_usdc {
            return Err(RiskError::MaxCapitalExceeded);
        }
        Ok(())
    }

    pub fn check_drawdown(total_pnl: f64, max_drawdown: f64) -> Result<(), RiskError> {
        if total_pnl < -max_drawdown {
            return Err(RiskError::MaxDrawdownExceeded {
                pnl: total_pnl,
                max_drawdown,
            });
        }
        Ok(())
    }
}

#[derive(Debug, thiserror::Error)]
pub enum RiskError {
    #[error("Price {actual} exceeds maximum {max}")]
    PriceTooHigh { max: Decimal, actual: Decimal },
    #[error("Strategy is disabled")]
    StrategyDisabled,
    #[error("Not passive: price {actual} exceeds passive max {max}")]
    NotPassive { max: Decimal, actual: Decimal },
    #[error("Both sides blocked by strategy config")]
    BothSidesBlocked,
    #[error("Max trades exceeded for this market")]
    MaxTradesExceeded,
    #[error("Max capital exceeded")]
    MaxCapitalExceeded,
    #[error("Drawdown {pnl} exceeds max drawdown limit of {limit}", limit = -0.0f64)]
    MaxDrawdownExceeded { pnl: f64, max_drawdown: f64 },
}
