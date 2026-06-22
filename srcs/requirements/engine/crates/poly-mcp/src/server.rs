use std::sync::Arc;

use rmcp::{
    ErrorData as McpError, ServerHandler,
    handler::server::{
        router::tool::ToolRouter,
        wrapper::Parameters,
    },
    model::*,
    tool, tool_handler, tool_router,
};

use crate::params::{
    clamp_limit, sanitize_guidance, validate_amount, validate_recipient, validate_vault_id, *,
};
use crate::state::EngineState;

#[derive(Clone)]
pub struct PolyMcpServer {
    state: Arc<EngineState>,
    tool_router: ToolRouter<Self>,
}

#[tool_router]
impl PolyMcpServer {
    pub fn new(state: Arc<EngineState>) -> Self {
        Self {
            state,
            tool_router: Self::tool_router(),
        }
    }

    #[tool(description = "Start the trading engine for a vault. Returns run_id and status.")]
    async fn start_engine(
        &self,
        Parameters(VaultIdParams { vault_id }): Parameters<VaultIdParams>,
    ) -> Result<CallToolResult, McpError> {
        validate_vault_id(&vault_id).map_err(bad_param("start_engine"))?;
        match self.state.engine.start_vault(&vault_id).await {
            Ok(run_id) => json_result(serde_json::json!({
                "run_id": run_id,
                "status": "running"
            })),
            Err(e) => Err(McpError::internal_error(
                "start_engine_failed",
                Some(serde_json::json!({ "error": e.to_string() })),
            )),
        }
    }

    #[tool(description = "Stop a running trading engine for a vault.")]
    async fn stop_engine(
        &self,
        Parameters(VaultIdParams { vault_id }): Parameters<VaultIdParams>,
    ) -> Result<CallToolResult, McpError> {
        validate_vault_id(&vault_id).map_err(bad_param("stop_engine"))?;
        match self.state.engine.stop_vault(&vault_id).await {
            Ok(()) => json_result(serde_json::json!({ "status": "stopped" })),
            Err(e) => Err(McpError::internal_error(
                "stop_engine_failed",
                Some(serde_json::json!({ "error": e.to_string() })),
            )),
        }
    }

    #[tool(description = "Get the current engine status and state for a vault.")]
    async fn engine_status(
        &self,
        Parameters(VaultIdParams { vault_id }): Parameters<VaultIdParams>,
    ) -> Result<CallToolResult, McpError> {
        validate_vault_id(&vault_id).map_err(bad_param("engine_status"))?;
        match self.state.engine.get_status(&vault_id).await {
            Some((status, state)) => json_result(serde_json::json!({
                "vault_id": vault_id,
                // Use the Display impls so the wire format matches the DB /
                // HTTP handler (lowercase "running", uppercase "IDLE"), not the
                // Debug form ("Running") which breaks consumer pattern matching.
                "status": status.to_string(),
                "state": state.to_string(),
            })),
            None => json_result(serde_json::json!({
                "vault_id": vault_id,
                "status": "stopped",
                "state": "IDLE",
            })),
        }
    }

    #[tool(description = "Cancel all open orders for a vault.")]
    async fn cancel_orders(
        &self,
        Parameters(VaultIdParams { vault_id }): Parameters<VaultIdParams>,
    ) -> Result<CallToolResult, McpError> {
        validate_vault_id(&vault_id).map_err(bad_param("cancel_orders"))?;
        let pool = self.state.engine.pool();
        match poly_db::orders::cancel_by_vault(pool, &vault_id).await {
            Ok(count) => json_result(serde_json::json!({
                "cancelled": count,
                "status": "ok"
            })),
            Err(e) => Err(McpError::internal_error(
                "cancel_orders_failed",
                Some(serde_json::json!({ "error": e.to_string() })),
            )),
        }
    }

    #[tool(description = "List all actively running engines tracked by this MCP process.")]
    async fn active_engines(&self) -> Result<CallToolResult, McpError> {
        let active = self.state.engine.list_active().await;
        json_result(serde_json::json!({
            // NOTE: reflects only engines started within THIS poly-mcp process.
            // The HTTP engine process keeps its own separate in-memory run list,
            // so vaults started via HTTP will not appear here.
            "engines": active.iter().map(|(id, state)| serde_json::json!({
                "vault_id": id,
                "state": state.to_string(),
            })).collect::<Vec<_>>()
        }))
    }

    #[tool(description = "List all vaults.")]
    async fn list_vaults(&self) -> Result<CallToolResult, McpError> {
        let pool = self.state.engine.pool();
        match poly_db::vaults::get_all(pool).await {
            Ok(vaults) => json_result(serde_json::json!({ "vaults": vaults })),
            Err(e) => Err(McpError::internal_error(
                "list_vaults_failed",
                Some(serde_json::json!({ "error": e.to_string() })),
            )),
        }
    }

    #[tool(description = "Get a single vault by ID.")]
    async fn get_vault(
        &self,
        Parameters(VaultIdParams { vault_id }): Parameters<VaultIdParams>,
    ) -> Result<CallToolResult, McpError> {
        validate_vault_id(&vault_id).map_err(bad_param("get_vault"))?;
        let pool = self.state.engine.pool();
        match poly_db::vaults::get_by_id(pool, &vault_id).await {
            Ok(Some(vault)) => json_result(serde_json::json!({ "vault": vault })),
            // The parameters were valid; the resource simply does not exist.
            // Use resource_not_found rather than invalid_params so consumers do
            // not mistake this for a malformed id and retry with other formats.
            Ok(None) => Err(McpError::resource_not_found(
                "vault_not_found",
                Some(serde_json::json!({ "vault_id": vault_id })),
            )),
            Err(e) => Err(McpError::internal_error(
                "get_vault_failed",
                Some(serde_json::json!({ "error": e.to_string() })),
            )),
        }
    }

    #[tool(description = "Create a new vault with a per-vault agent EOA.")]
    async fn create_vault(
        &self,
        Parameters(params): Parameters<CreateVaultParams>,
    ) -> Result<CallToolResult, McpError> {
        let pool = self.state.engine.pool();
        let encryption_key = &self.state.engine.config().vault_encryption_key;

        let vault_id = uuid::Uuid::new_v4().to_string();

        // Generate per-vault keypair up front (no DB writes yet).
        let (private_key_hex, public_address) = poly_db::keypairs::generate_keypair()
            .map_err(|e| McpError::internal_error(
                "keypair_generation_failed",
                Some(serde_json::json!({ "error": e.to_string() })),
            ))?;

        let salt = poly_db::keypairs::generate_salt();
        let encrypted = poly_db::keypairs::encrypt_key(&private_key_hex, encryption_key, &salt)
            .map_err(|e| McpError::internal_error(
                "encryption_failed",
                Some(serde_json::json!({ "error": e.to_string() })),
            ))?;

        let vault = poly_types::vault::Vault {
            id: vault_id.clone(),
            name: params.name.unwrap_or_else(|| "New Vault".into()),
            wallet_address: params.wallet_address,
            strategy: params.strategy.unwrap_or(serde_json::json!({})),
            funding: serde_json::json!({}),
            inventory: serde_json::json!({}),
            stats: serde_json::json!({}),
            mode: poly_types::vault::VaultMode::default(),
            token_balance: 0,
            active_market: None,
            sparkline: None,
            created: chrono::Utc::now().timestamp_millis(),
        };

        // Insert the vault row BEFORE its keypair: vault_keypairs.vault_id has a
        // FOREIGN KEY ... REFERENCES vaults(id), so inserting the keypair first
        // violates the constraint. If the keypair insert then fails, we roll
        // back by deleting the just-inserted vault row so no orphan rows remain.
        // (Matches the FK ordering used by the HTTP engine handler.)
        poly_db::vaults::insert(pool, &vault)
            .await
            .map_err(|e| McpError::internal_error(
                "create_vault_failed",
                Some(serde_json::json!({ "error": e.to_string() })),
            ))?;

        if let Err(e) = poly_db::keypairs::insert(pool, &vault_id, &encrypted, &public_address, &salt).await {
            // Cleanup the orphan vault row so a retry is not blocked by a
            // half-created vault with no keypair.
            let _ = sqlx::query("DELETE FROM vaults WHERE id = $1")
                .bind(&vault_id)
                .execute(pool)
                .await;
            return Err(McpError::internal_error(
                "keypair_insert_failed",
                Some(serde_json::json!({ "error": e.to_string() })),
            ));
        }

        json_result(serde_json::json!({
            "vault": vault,
            "agent_address": public_address,
        }))
    }

    #[tool(description = "Update strategy configuration for a vault.")]
    async fn update_config(
        &self,
        Parameters(params): Parameters<UpdateConfigParams>,
    ) -> Result<CallToolResult, McpError> {
        validate_vault_id(&params.vault_id).map_err(bad_param("update_config"))?;
        let pool = self.state.engine.pool();

        // PARTIAL-UPDATE semantics: only fields supplied as Some(value) are
        // changed; every other field is preserved from the existing stored
        // config (falling back to defaults only if none exists). This matches
        // RFC 7396 JSON Merge Patch intent — send `{ "enabled": false }` to
        // toggle one knob without touching entry_price / order_size / etc.
        // (Consumers needing a full reset should send every field explicitly.)
        let existing = poly_db::vaults::get_strategy_config(pool, &params.vault_id)
            .await
            .ok()
            .flatten()
            .unwrap_or_default();

        let config = poly_types::vault::StrategyConfig {
            vault_id: params.vault_id.clone(),
            enabled: params.enabled.unwrap_or(existing.enabled),
            entry_price: params.entry_price.unwrap_or(existing.entry_price),
            exit_price: params.exit_price.unwrap_or(existing.exit_price),
            order_size: params.order_size.unwrap_or(existing.order_size),
            max_capital_usdc: params.max_capital_usdc.or(existing.max_capital_usdc),
            max_trades_per_market: params
                .max_trades_per_market
                .unwrap_or(existing.max_trades_per_market),
            max_trades_policy: params
                .max_trades_policy
                .unwrap_or(existing.max_trades_policy),
            no_new_entries_last_seconds: params
                .no_new_entries_last_seconds
                .unwrap_or(existing.no_new_entries_last_seconds),
            keep_sell_orders_after_expiry_seconds: params
                .keep_sell_orders_after_expiry_seconds
                .unwrap_or(existing.keep_sell_orders_after_expiry_seconds),
            reconcile_interval_cycles: params
                .reconcile_interval_cycles
                .unwrap_or(existing.reconcile_interval_cycles),
            min_spread_required: params.min_spread_required.or(existing.min_spread_required),
            strict_passive_only: params
                .strict_passive_only
                .unwrap_or(existing.strict_passive_only),
            allow_both_sides: params.allow_both_sides.unwrap_or(existing.allow_both_sides),
            cancel_open_buys_on_expiry: params
                .cancel_open_buys_on_expiry
                .unwrap_or(existing.cancel_open_buys_on_expiry),
            auto_reentry_enabled: params
                .auto_reentry_enabled
                .unwrap_or(existing.auto_reentry_enabled),
            max_drawdown_usdc: params
                .max_drawdown_usdc
                .unwrap_or(existing.max_drawdown_usdc),
        };

        match poly_db::vaults::upsert_strategy(pool, &config).await {
            Ok(()) => json_result(serde_json::json!({
                "status": "updated",
                "vault_id": params.vault_id
            })),
            Err(e) => Err(McpError::internal_error(
                "update_config_failed",
                Some(serde_json::json!({ "error": e.to_string() })),
            )),
        }
    }

    #[tool(description = "Get open orders for a vault.")]
    async fn get_orders(
        &self,
        Parameters(VaultIdParams { vault_id }): Parameters<VaultIdParams>,
    ) -> Result<CallToolResult, McpError> {
        validate_vault_id(&vault_id).map_err(bad_param("get_orders"))?;
        let pool = self.state.engine.pool();
        match poly_db::orders::get_open_by_vault(pool, &vault_id).await {
            Ok(orders) => json_result(serde_json::json!({ "orders": orders })),
            Err(e) => Err(McpError::internal_error(
                "get_orders_failed",
                Some(serde_json::json!({ "error": e.to_string() })),
            )),
        }
    }

    #[tool(description = "Recent decision-to-outcome pairs for a vault, newest first — the learning signal.
Each item joins an AI trading decision to what actually happened: the decision context (side bias, confidence, reasoning, decision_inputs), the YES/NO orders placed, whether they filled, the market resolution (winning_side), and realized PnL. Unreconciled (still-open) outcomes are included with null result fields. Use this to learn which decisions made or lost money.")]
    async fn get_recent_outcomes(
        &self,
        Parameters(VaultLimitParams { vault_id, limit }): Parameters<VaultLimitParams>,
    ) -> Result<CallToolResult, McpError> {
        validate_vault_id(&vault_id).map_err(bad_param("get_recent_outcomes"))?;
        let pool = self.state.engine.pool();
        // Clamp to a safe upper bound so a huge consumer-supplied value cannot
        // ask Postgres to materialize millions of rows and OOM the process.
        let limit = clamp_limit(limit, 50);
        match poly_db::outcomes::get_recent(pool, &vault_id, limit).await {
            Ok(outcomes) => json_result(serde_json::json!({ "outcomes": outcomes })),
            Err(e) => Err(McpError::internal_error(
                "get_recent_outcomes_failed",
                Some(serde_json::json!({ "error": e.to_string() })),
            )),
        }
    }

    #[tool(description = "Get the current active guidance for a vault — the contextual advice the engine's AI reads each cycle. This is the closed learning loop: OpenClaw reflection writes here, the next trading decision sees it. Returns empty string if none set.")]
    async fn get_active_guidance(
        &self,
        Parameters(VaultIdParams { vault_id }): Parameters<VaultIdParams>,
    ) -> Result<CallToolResult, McpError> {
        validate_vault_id(&vault_id).map_err(bad_param("get_active_guidance"))?;
        let pool = self.state.engine.pool();
        match poly_db::guidance::get(pool, &vault_id).await {
            Ok(guidance) => json_result(serde_json::json!({
                "vault_id": vault_id,
                "guidance": guidance,
            })),
            Err(e) => Err(McpError::internal_error(
                "get_active_guidance_failed",
                Some(serde_json::json!({ "error": e.to_string() })),
            )),
        }
    }

    #[tool(description = "Set the active guidance for a vault — contextual advice injected into the engine AI's prompt on the next cycle. Write ONE concrete, actionable rule the model can heed (e.g. 'Skip both-side quotes when seconds_to_expiry < 60 and spread > 2c'). Empty string clears it. This is how learning reaches trading: reflection → set_active_guidance → next decision.")]
    async fn set_active_guidance(
        &self,
        Parameters(GuidanceParams { vault_id, guidance }): Parameters<GuidanceParams>,
    ) -> Result<CallToolResult, McpError> {
        validate_vault_id(&vault_id).map_err(bad_param("set_active_guidance"))?;
        // Guidance is injected verbatim into the trading AI's prompt each cycle,
        // so it is sanitized before persistence: a hard length cap rejects
        // oversized payloads and ASCII control characters are stripped to blunt
        // prompt-injection / obfuscation attempts. A value over the cap is
        // rejected (not silently truncated) so the caller knows it was ignored.
        let (sanitized, err) = sanitize_guidance(&guidance);
        if let Some(msg) = err {
            return Err(McpError::invalid_params(
                "invalid_guidance",
                Some(serde_json::json!({ "error": msg })),
            ));
        }
        let pool = self.state.engine.pool();
        let now = chrono::Utc::now().timestamp_millis();
        match poly_db::guidance::set(pool, &vault_id, &sanitized, now).await {
            Ok(()) => json_result(serde_json::json!({
                "status": "set",
                "vault_id": vault_id,
                "guidance": sanitized,
            })),
            Err(e) => Err(McpError::internal_error(
                "set_active_guidance_failed",
                Some(serde_json::json!({ "error": e.to_string() })),
            )),
        }
    }

    #[tool(description = "Get PnL history snapshots for a vault.")]
    async fn get_pnl(
        &self,
        Parameters(VaultLimitParams { vault_id, limit }): Parameters<VaultLimitParams>,
    ) -> Result<CallToolResult, McpError> {
        validate_vault_id(&vault_id).map_err(bad_param("get_pnl"))?;
        let pool = self.state.engine.pool();
        let limit = clamp_limit(limit, 100);
        match poly_db::pnl::get_history(pool, &vault_id, limit).await {
            Ok(snapshots) => json_result(serde_json::json!({ "snapshots": snapshots })),
            Err(e) => Err(McpError::internal_error(
                "get_pnl_failed",
                Some(serde_json::json!({ "error": e.to_string() })),
            )),
        }
    }

    #[tool(description = "Get audit events for a vault.")]
    async fn get_audit(
        &self,
        Parameters(VaultLimitParams { vault_id, limit }): Parameters<VaultLimitParams>,
    ) -> Result<CallToolResult, McpError> {
        validate_vault_id(&vault_id).map_err(bad_param("get_audit"))?;
        let pool = self.state.engine.pool();
        let limit = clamp_limit(limit, 100);
        match poly_db::audit::get_by_vault(pool, &vault_id, limit).await {
            Ok(events) => json_result(serde_json::json!({ "events": events })),
            Err(e) => Err(McpError::internal_error(
                "get_audit_failed",
                Some(serde_json::json!({ "error": e.to_string() })),
            )),
        }
    }

    #[tool(description = "Get the agent EOA address for a vault (for depositing USDC).")]
    async fn vault_agent_address(
        &self,
        Parameters(VaultIdParams { vault_id }): Parameters<VaultIdParams>,
    ) -> Result<CallToolResult, McpError> {
        validate_vault_id(&vault_id).map_err(bad_param("vault_agent_address"))?;
        let pool = self.state.engine.pool();
        match poly_db::keypairs::get_address(pool, &vault_id).await {
            Ok(Some(address)) => json_result(serde_json::json!({
                "vault_id": vault_id,
                "agent_address": address,
            })),
            Ok(None) => Err(McpError::resource_not_found(
                "no_keypair_for_vault",
                Some(serde_json::json!({ "vault_id": vault_id })),
            )),
            Err(e) => Err(McpError::internal_error(
                "get_agent_address_failed",
                Some(serde_json::json!({ "error": e.to_string() })),
            )),
        }
    }

    #[tool(description = "Get the on-chain USDC balance for a vault's agent EOA on Polygon.")]
    async fn vault_balance(
        &self,
        Parameters(VaultIdParams { vault_id }): Parameters<VaultIdParams>,
    ) -> Result<CallToolResult, McpError> {
        validate_vault_id(&vault_id).map_err(bad_param("vault_balance"))?;
        let pool = self.state.engine.pool();
        let config = self.state.engine.config();

        let address = poly_db::keypairs::get_address(pool, &vault_id)
            .await
            .map_err(|e| McpError::internal_error(
                "get_address_failed",
                Some(serde_json::json!({ "error": e.to_string() })),
            ))?
            .ok_or_else(|| McpError::resource_not_found(
                "no_keypair_for_vault",
                Some(serde_json::json!({ "vault_id": vault_id })),
            ))?;

        match poly_market::onchain::get_usdc_balance(
            &config.polygon_rpc_url,
            &config.polygon_usdc_address,
            &address,
        )
        .await
        {
            Ok(balance) => json_result(serde_json::json!({
                "vault_id": vault_id,
                "agent_address": address,
                "usdc_balance": balance,
            })),
            Err(e) => Err(McpError::internal_error(
                "balance_check_failed",
                Some(serde_json::json!({ "error": e.to_string() })),
            )),
        }
    }

    #[tool(description = "Withdraw USDC from a vault's agent EOA to a recipient address on Polygon.")]
    async fn withdraw_vault(
        &self,
        Parameters(WithdrawParams { vault_id, recipient, amount }): Parameters<WithdrawParams>,
    ) -> Result<CallToolResult, McpError> {
        // Validate at the tool boundary so malformed values fail here with a
        // clear error instead of producing a cryptic RPC failure deep in the
        // on-chain transfer call.
        validate_vault_id(&vault_id).map_err(bad_param("withdraw_vault"))?;
        validate_recipient(&recipient).map_err(bad_param("withdraw_vault"))?;
        validate_amount(&amount).map_err(bad_param("withdraw_vault"))?;

        let pool = self.state.engine.pool();
        let config = self.state.engine.config();

        let private_key = poly_db::keypairs::decrypt_for_signing(
            pool,
            &vault_id,
            &config.vault_encryption_key,
        )
        .await
        .map_err(|e| McpError::internal_error(
            "decrypt_key_failed",
            Some(serde_json::json!({ "error": e.to_string() })),
        ))?;

        match poly_market::onchain::transfer_usdc(
            &config.polygon_rpc_url,
            &config.polygon_usdc_address,
            &private_key,
            &recipient,
            &amount,
        )
        .await
        {
            Ok(tx_hash) => json_result(serde_json::json!({
                "vault_id": vault_id,
                "tx_hash": tx_hash,
                "recipient": recipient,
                "amount": amount,
            })),
            Err(e) => Err(McpError::internal_error(
                "withdraw_failed",
                Some(serde_json::json!({ "error": e.to_string() })),
            )),
        }
    }
}

#[tool_handler]
impl ServerHandler for PolyMcpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            protocol_version: ProtocolVersion::V_2024_11_05,
            capabilities: ServerCapabilities::builder()
                .enable_tools()
                .build(),
            server_info: Implementation::from_build_env(),
            instructions: Some(
                "PolyAgents MCP Server — autonomous trading on Polymarket BTC 5-min markets. \
                 Use create_vault to create a vault, start_engine to begin trading, \
                 engine_status to monitor, stop_engine to halt. \
                 Use get_orders, get_pnl, get_audit to inspect state. \
                 Use update_config to adjust strategy parameters at runtime."
                    .to_string(),
            ),
        }
    }
}

fn json_result(value: serde_json::Value) -> Result<CallToolResult, McpError> {
    Ok(CallToolResult::success(vec![Content::text(
        serde_json::to_string_pretty(&value).unwrap_or_default(),
    )]))
}

/// Build a closure that converts a validation error message into an MCP
/// `invalid_params` error tagged with the originating tool name. Used with
/// `?` after each input check: `validate_vault_id(&id).map_err(bad_param("..."))?;`
fn bad_param(tool: &'static str) -> impl Fn(String) -> McpError {
    move |message: String| {
        McpError::invalid_params(
            // Keep the tool name as the structured message so consumers can tell
            // which tool rejected the input; the human-readable reason goes in data.
            tool,
            Some(serde_json::json!({ "error": message })),
        )
    }
}
