use anyhow::Result;
use std::sync::Arc;
use tokio::sync::RwLock;

use poly_ai::AiClient;
use poly_db::PgPool;
use poly_market::PolymarketAdapter;
use poly_types::config::AppConfig;
use poly_types::engine::{EngineRun, EngineRunStatus, EngineState};
use poly_types::vault::{StrategyConfig, Vault};

use crate::cycle::{CycleDecision, CycleRunner};
use crate::reconcile::Reconciler;

/// Default cycle interval for 5-minute markets (seconds)
const DEFAULT_CYCLE_INTERVAL_SECS: u64 = 5;

pub struct TradingEngine {
    config: Arc<AppConfig>,
    pool: Arc<PgPool>,
    market: Arc<PolymarketAdapter>,
    ai: Arc<AiClient>,
    runs: Arc<RwLock<Vec<EngineRun>>>,
}

impl TradingEngine {
    pub fn new(
        config: AppConfig,
        pool: PgPool,
        market: PolymarketAdapter,
        ai: AiClient,
    ) -> Self {
        Self {
            config: Arc::new(config),
            pool: Arc::new(pool),
            market: Arc::new(market),
            ai: Arc::new(ai),
            runs: Arc::new(RwLock::new(Vec::new())),
        }
    }

    /// Spawn the lagged reconciliation loop. Close out OPEN trade outcomes
    /// (fill + PnL) once their markets resolve. Safe to call once at startup;
    /// the loop runs for the process lifetime and sweeps on a slow timer.
    pub fn spawn_reconciler(&self) {
        Reconciler::new(
            self.config.clone(),
            self.pool.clone(),
            self.market.clone(),
        )
        .spawn();
    }

    pub async fn start_vault(&self, vault_id: &str) -> Result<String> {
        // Duplicate-start guard: reject if a run is already active for this
        // vault. Without this, repeated start calls (or a dual MCP + HTTP
        // caller) would spawn multiple concurrent state loops for the same
        // vault, each placing independent orders and double-counting PnL.
        {
            let runs = self.runs.read().await;
            if runs
                .iter()
                .any(|r| r.vault_id == vault_id && r.status == EngineRunStatus::Running)
            {
                return Err(anyhow::anyhow!(
                    "Vault {} already has an active engine run",
                    vault_id
                ));
            }
        }

        let vault = poly_db::vaults::get_by_id(&self.pool, vault_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Vault {} not found", vault_id))?;

        // Load strategy config from DB, fall back to defaults
        let strategy = poly_db::vaults::get_strategy_config(&self.pool, vault_id)
            .await
            .ok()
            .flatten()
            .unwrap_or_default();

        // Load and decrypt per-vault agent key (if available)
        let agent_key = poly_db::keypairs::decrypt_for_signing(
            &self.pool,
            vault_id,
            &self.config.vault_encryption_key,
        )
        .await
        .ok();

        if agent_key.is_some() {
            tracing::info!(vault_id = vault_id, "Loaded per-vault agent key");
        } else {
            tracing::warn!(vault_id = vault_id, "No per-vault key, using global config key");
        }

        let run_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp_millis();

        let run = EngineRun {
            id: run_id.clone(),
            vault_id: vault_id.into(),
            status: EngineRunStatus::Running,
            current_state: EngineState::Idle,
            active_market_id: None,
            started_at: now,
            stopped_at: None,
            last_heartbeat_at: now,
            last_error: None,
        };

        poly_db::engine_runs::create(&self.pool, &run).await?;
        self.runs.write().await.push(run);

        // Spawn state-driven cycle loop
        let engine = self.clone();
        let vault_id_owned = vault_id.to_string();
        let run_id_clone = run_id.clone();
        tokio::spawn(async move {
            if let Err(e) = engine.run_state_loop(&vault_id_owned, &run_id_clone, &vault, &strategy, agent_key).await {
                tracing::error!("State loop error for vault {}: {}", vault_id_owned, e);
            }
        });

        tracing::info!(vault_id = vault_id, run_id = %run_id, "Started engine");
        Ok(run_id)
    }

    pub async fn stop_vault(&self, vault_id: &str) -> Result<()> {
        let mut runs = self.runs.write().await;

        // Collect the IDs of every active run for this vault up front. Stopping
        // by `find()` would only stop the first match, leaving any duplicates
        // (created before the start guard existed) running in the background.
        let to_stop: Vec<String> = runs
            .iter()
            .filter(|r| r.vault_id == vault_id && r.status == EngineRunStatus::Running)
            .map(|r| r.id.clone())
            .collect();

        if to_stop.is_empty() {
            // No active run for this vault: surface an explicit error rather
            // than a silent Ok so callers (MCP tool, HTTP handler) can't be
            // misled into believing an unknown/other-process vault was stopped.
            return Err(anyhow::anyhow!(
                "No active engine run found for vault {}",
                vault_id
            ));
        }

        let now = chrono::Utc::now().timestamp_millis();
        for run in runs.iter_mut().filter(|r| to_stop.contains(&r.id)) {
            run.status = EngineRunStatus::Stopped;
            run.current_state = EngineState::Idle;
            poly_db::engine_runs::stop(&self.pool, &run.id, now).await?;
            tracing::info!(vault_id = vault_id, run_id = %run.id, "Stopped engine");
        }
        Ok(())
    }

    /// Main state-driven loop implementing the 9-state lifecycle.
    ///
    /// States: Idle → DiscoveringMarket → Ready → Quoting →
    ///         HoldingInventory → ExpiryGuard → RollingOver → Reconciling → Idle
    async fn run_state_loop(
        &self,
        _vault_id: &str,
        run_id: &str,
        vault: &Vault,
        strategy: &StrategyConfig,
        agent_private_key: Option<String>,
    ) -> Result<()> {
        let runner = CycleRunner::new(
            &self.config,
            &self.pool,
            &self.market,
            &self.ai,
            vault,
            run_id,
            agent_private_key,
        );

        let cycle_interval = DEFAULT_CYCLE_INTERVAL_SECS;
        let mut state = EngineState::Idle;
        // Decision carried from DiscoveringMarket into Quoting so the full
        // discover→decide→place flow runs exactly once per loop, not twice.
        let mut pending: Option<CycleDecision> = None;

        loop {
            // Check if still running
            let runs = self.runs.read().await;
            let active = runs
                .iter()
                .any(|r| r.id == run_id && r.status == EngineRunStatus::Running);
            drop(runs);

            if !active {
                tracing::info!(run_id = run_id, "Run stopped, exiting state loop");
                break;
            }

            state = self
                .transition_state(&runner, state, strategy, &mut pending, vault)
                .await;

            // Update current state in memory
            let mut runs = self.runs.write().await;
            if let Some(run) = runs.iter_mut().find(|r| r.id == run_id) {
                run.current_state = state;
                run.last_heartbeat_at = chrono::Utc::now().timestamp_millis();
            }
            drop(runs);

            // Persist heartbeat
            let now = chrono::Utc::now().timestamp_millis();
            let _ = poly_db::engine_runs::update_state(&self.pool, run_id, state, now).await;

            tokio::time::sleep(tokio::time::Duration::from_secs(cycle_interval)).await;
        }

        Ok(())
    }

    /// Execute one state transition and return the next state.
    ///
    /// `pending` carries the `CycleDecision` from `DiscoveringMarket` into
    /// `Quoting` so the discover→decide→place flow runs once, not twice.
    async fn transition_state(
        &self,
        runner: &CycleRunner<'_>,
        current: EngineState,
        strategy: &StrategyConfig,
        pending: &mut Option<CycleDecision>,
        vault: &Vault,
    ) -> EngineState {
        match current {
            EngineState::Idle => {
                tracing::info!(state = "Idle", "Transitioning → DiscoveringMarket");
                EngineState::DiscoveringMarket
            }

            EngineState::DiscoveringMarket => {
                tracing::debug!(state = "DiscoveringMarket", "Searching for active BTC 5-min market");
                match runner.discover().await {
                    Ok(decision) => {
                        tracing::info!(state = "DiscoveringMarket", "Market found, transitioning → Ready");
                        *pending = Some(decision);
                        EngineState::Ready
                    }
                    Err(e) => {
                        tracing::warn!(state = "DiscoveringMarket", error = %e, "Discovery failed, back to Idle");
                        EngineState::Idle
                    }
                }
            }

            EngineState::Ready => {
                tracing::info!(state = "Ready", "Transitioning → Quoting");
                EngineState::Quoting
            }

            EngineState::Quoting => {
                tracing::debug!(state = "Quoting", "Placing passive bids on both sides");

                if !strategy.enabled {
                    tracing::warn!(state = "Quoting", "Strategy disabled, skipping");
                    *pending = None;
                    return EngineState::Idle;
                }

                let Some(mut decision) = pending.take() else {
                    tracing::warn!(state = "Quoting", "No pending decision, back to DiscoveringMarket");
                    return EngineState::DiscoveringMarket;
                };

                match runner.quote(&mut decision).await {
                    Ok(()) => {
                        tracing::info!(state = "Quoting", "Orders placed, transitioning → HoldingInventory");
                        EngineState::HoldingInventory
                    }
                    Err(e) => {
                        tracing::warn!(state = "Quoting", error = %e, "Quoting failed, back to Ready");
                        *pending = Some(decision);
                        EngineState::Ready
                    }
                }
            }

            EngineState::HoldingInventory => {
                tracing::debug!(state = "HoldingInventory", "Monitoring fills and market expiry");
                // Fill monitoring is the reconciler's job (Phase 1b); here we
                // only decide whether to run the expiry guard before rolling over.
                if strategy.cancel_open_buys_on_expiry {
                    EngineState::ExpiryGuard
                } else {
                    EngineState::RollingOver
                }
            }

            EngineState::ExpiryGuard => {
                tracing::info!(state = "ExpiryGuard", "Cancelling open buy orders near expiry");
                match poly_db::orders::cancel_by_vault(&self.pool, &vault.id).await {
                    Ok(n) => tracing::info!(state = "ExpiryGuard", cancelled = n, "Cancelled open orders"),
                    Err(e) => tracing::warn!(state = "ExpiryGuard", error = %e, "Cancel failed"),
                }
                EngineState::RollingOver
            }

            EngineState::RollingOver => {
                tracing::info!(state = "RollingOver", "Market cycle complete, transitioning → Reconciling");
                EngineState::Reconciling
            }

            EngineState::Reconciling => {
                // Per-vault PnL and drawdown are computed by the reconciler
                // (Phase 1b) from realized trade outcomes, not here. The SM
                // reconcile tick is a no-op pass-through until that lands.
                tracing::info!(state = "Reconciling", "Transitioning → Idle");
                EngineState::Idle
            }
        }
    }

    pub async fn get_status(&self, vault_id: &str) -> Option<(EngineRunStatus, EngineState)> {
        let runs = self.runs.read().await;
        runs.iter()
            .find(|r| r.vault_id == vault_id && r.status == EngineRunStatus::Running)
            .map(|r| (r.status, r.current_state))
    }

    pub async fn list_active(&self) -> Vec<(String, EngineState)> {
        let runs = self.runs.read().await;
        runs.iter()
            .filter(|r| r.status == EngineRunStatus::Running)
            .map(|r| (r.vault_id.clone(), r.current_state))
            .collect()
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    pub fn config(&self) -> &AppConfig {
        &self.config
    }
}

impl Clone for TradingEngine {
    fn clone(&self) -> Self {
        Self {
            config: self.config.clone(),
            pool: self.pool.clone(),
            market: self.market.clone(),
            ai: self.ai.clone(),
            runs: self.runs.clone(),
        }
    }
}
