use anyhow::Result;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use clap::Parser;
use serde_json::{json, Value};
use std::sync::Arc;
use tower_http::cors::CorsLayer;

use poly_ai::AiClient;
use poly_db::create_pool;
use poly_engine::TradingEngine;
use poly_market::PolymarketAdapter;
use poly_types::config::AppConfig;

#[derive(Parser)]
#[command(name = "polyagents-engine", about = "PolyAgents trading engine")]
struct Cli {
    /// Config file path
    #[arg(short, long, default_value = ".env")]
    config: String,

    /// Host to bind
    #[arg(long, default_value = "0.0.0.0")]
    host: String,

    /// Port to bind
    #[arg(short, long, default_value_t = 8080)]
    port: u16,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter("polyagents_engine=info,poly_market=info,poly_ai=info,poly_engine=info")
        .init();

    let cli = Cli::parse();

    let mut config = AppConfig::from_env()?;
    // `from_env()` supplies default server settings; let clap override them.
    config.server = poly_types::config::ServerConfig {
        host: cli.host.clone(),
        port: cli.port,
    };
    let database_url = config.database_url.clone();

    tracing::info!("Connecting to database...");
    let pool = create_pool(&database_url).await?;

    tracing::info!("Running migrations...");
    sqlx::migrate!("./migrations").run(&pool).await?;

    let http = reqwest::Client::new();
    let market = PolymarketAdapter::new(&config.polymarket, http.clone());
    let ai = AiClient::new(config.ai.clone());

    let engine = Arc::new(TradingEngine::new(config, pool, market, ai));

    // Spawn the reconciliation loop: closes out OPEN trade outcomes (fills +
    // PnL) once their markets resolve. Runs for the process lifetime.
    engine.spawn_reconciler();

    let app = Router::new()
        .route("/health", get(health))
        .route("/vaults", get(list_vaults).post(create_vault))
        .route("/vaults/{id}", get(get_vault).put(update_vault).delete(delete_vault))
        .route("/vaults/{id}/config", get(get_config).put(update_config))
        .route("/vaults/{id}/agent-address", get(get_agent_address))
        .route("/vaults/{id}/balance", get(get_balance))
        .route("/vaults/{id}/withdraw", post(withdraw))
        .route("/engine/{vault_id}/start", post(start_engine))
        .route("/engine/{vault_id}/stop", post(stop_engine))
        .route("/engine/{vault_id}/status", get(engine_status))
        .route("/engine/{vault_id}/cancel-orders", post(cancel_orders))
        .route("/engine/active", get(active_engines))
        .route("/engine-runs/{vault_id}", get(get_engine_run))
        .route("/orders/{vault_id}", get(get_orders))
        .route("/pnl/{vault_id}", get(get_pnl))
        .route("/audit/{vault_id}", get(get_audit))
        .route("/market-state/{vault_id}", get(get_market_state))
        .route("/books/{vault_id}", get(get_books))
        .layer(CorsLayer::permissive())
        .with_state(engine.clone());

    let addr = format!("{}:{}", cli.host, cli.port);
    tracing::info!("PolyAgents engine listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;

    // Graceful shutdown: catch SIGTERM/SIGINT, stop all active vaults
    let shutdown_engine = engine.clone();
    let shutdown = async move {
        tokio::signal::ctrl_c().await.ok();
        tracing::info!("Shutdown signal received, stopping all engines...");

        // Stop all active vaults (triggers order cancellation in state machine)
        let active = shutdown_engine.list_active().await;
        for (vault_id, state) in &active {
            tracing::info!(vault_id = vault_id, state = %state, "Stopping vault on shutdown");
            if let Err(e) = shutdown_engine.stop_vault(vault_id).await {
                tracing::error!(vault_id = vault_id, error = %e, "Failed to stop vault");
            }
        }

        tracing::info!("All engines stopped, draining for up to 10s...");
    };

    // Run server with shutdown signal
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown)
        .await?;

    tracing::info!("PolyAgents engine shut down cleanly");
    Ok(())
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok", "service": "polyagents-engine" }))
}

async fn list_vaults(State(engine): State<Arc<TradingEngine>>) -> Result<Json<Value>, StatusCode> {
    let pool = get_pool(&engine);
    match poly_db::vaults::get_all(pool).await {
        Ok(vaults) => Ok(Json(json!({ "vaults": vaults }))),
        Err(e) => {
            tracing::error!("List vaults error: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn get_vault(
    State(engine): State<Arc<TradingEngine>>,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let pool = get_pool(&engine);
    match poly_db::vaults::get_by_id(pool, &id).await {
        Ok(Some(vault)) => Ok(Json(json!({ "vault": vault }))),
        Ok(None) => Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Get vault error: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn create_vault(
    State(engine): State<Arc<TradingEngine>>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    let pool = get_pool(&engine);
    let encryption_key = &engine.config().vault_encryption_key;

    let vault_id = body["id"].as_str().unwrap_or(&uuid::Uuid::new_v4().to_string()).to_string();

    // Generate per-vault keypair
    let (private_key_hex, public_address) = poly_db::keypairs::generate_keypair()
        .map_err(|e| {
            tracing::error!("Keypair generation error: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let salt = poly_db::keypairs::generate_salt();
    let encrypted = poly_db::keypairs::encrypt_key(&private_key_hex, encryption_key, &salt)
        .map_err(|e| {
            tracing::error!("Encryption error: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let vault = poly_types::vault::Vault {
        id: vault_id.clone(),
        name: body["name"].as_str().unwrap_or("New Vault").into(),
        wallet_address: body["wallet_address"].as_str().map(String::from),
        strategy: body.get("strategy").cloned().unwrap_or(json!({})),
        funding: body.get("funding").cloned().unwrap_or(json!({})),
        inventory: body.get("inventory").cloned().unwrap_or(json!({})),
        stats: body.get("stats").cloned().unwrap_or(json!({})),
        mode: poly_types::vault::VaultMode::default(),
        token_balance: 0,
        active_market: None,
        sparkline: None,
        created: chrono::Utc::now().timestamp_millis(),
    };

    // Insert the vault row BEFORE its keypair: vault_keypairs.vault_id has an FK
    // back to vaults.id, so inserting the keypair first violates the constraint.
    poly_db::vaults::insert(pool, &vault)
        .await
        .map_err(|e| {
            tracing::error!("Create vault error: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    poly_db::keypairs::insert(pool, &vault_id, &encrypted, &public_address, &salt)
        .await
        .map_err(|e| {
            tracing::error!("Keypair insert error: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(json!({ "vault": vault, "agent_address": public_address })))
}

async fn start_engine(
    State(engine): State<Arc<TradingEngine>>,
    Path(vault_id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    match engine.start_vault(&vault_id).await {
        Ok(run_id) => Ok(Json(json!({ "run_id": run_id, "status": "running" }))),
        Err(e) => {
            tracing::error!("Start engine error: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn stop_engine(
    State(engine): State<Arc<TradingEngine>>,
    Path(vault_id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    match engine.stop_vault(&vault_id).await {
        Ok(()) => Ok(Json(json!({ "status": "stopped" }))),
        Err(e) => {
            tracing::error!("Stop engine error: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn engine_status(
    State(engine): State<Arc<TradingEngine>>,
    Path(vault_id): Path<String>,
) -> Json<Value> {
    match engine.get_status(&vault_id).await {
        Some((status, state)) => Json(json!({
            "vault_id": vault_id,
            "status": status.to_string(),
            "state": state.to_string(),
        })),
        None => Json(json!({
            "vault_id": vault_id,
            "status": "stopped",
            "state": "IDLE",
        })),
    }
}

async fn cancel_orders(
    State(engine): State<Arc<TradingEngine>>,
    Path(vault_id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let pool = get_pool(&engine);
    match poly_db::orders::get_open_by_vault(pool, &vault_id).await {
        Ok(orders) => {
            tracing::info!(vault_id = vault_id, count = orders.len(), "Cancelling open orders");
            Ok(Json(json!({
                "cancelled": orders.len(),
                "status": "ok"
            })))
        }
        Err(e) => {
            tracing::error!("Cancel orders error: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn active_engines(State(engine): State<Arc<TradingEngine>>) -> Json<Value> {
    let active = engine.list_active().await;
    Json(json!({
        "engines": active.iter().map(|(id, state)| json!({
            "vault_id": id,
            "state": state.to_string(),
        })).collect::<Vec<_>>()
    }))
}

async fn get_orders(
    State(engine): State<Arc<TradingEngine>>,
    Path(vault_id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let pool = get_pool(&engine);
    match poly_db::orders::get_open_by_vault(pool, &vault_id).await {
        Ok(orders) => Ok(Json(json!({ "orders": orders }))),
        Err(e) => {
            tracing::error!("Get orders error: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn get_pnl(
    State(engine): State<Arc<TradingEngine>>,
    Path(vault_id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let pool = get_pool(&engine);
    match poly_db::pnl::get_history(pool, &vault_id, 100).await {
        Ok(snapshots) => Ok(Json(json!({ "snapshots": snapshots }))),
        Err(e) => {
            tracing::error!("Get PnL error: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn get_audit(
    State(engine): State<Arc<TradingEngine>>,
    Path(vault_id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let pool = get_pool(&engine);
    match poly_db::audit::get_by_vault(pool, &vault_id, 100).await {
        Ok(events) => Ok(Json(json!({ "events": events }))),
        Err(e) => {
            tracing::error!("Get audit error: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn update_config(
    State(engine): State<Arc<TradingEngine>>,
    Path(id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    let pool = get_pool(&engine);

    let config = poly_types::vault::StrategyConfig {
        vault_id: id.clone(),
        enabled: body["enabled"].as_bool().unwrap_or(true),
        entry_price: body["entry_price"].as_f64().unwrap_or(0.01) as f32,
        exit_price: body["exit_price"].as_f64().unwrap_or(0.02) as f32,
        order_size: body["order_size"].as_u64().unwrap_or(10) as i32,
        max_capital_usdc: body["max_capital_usdc"].as_f64().map(|v| v as f32),
        max_trades_per_market: body["max_trades_per_market"].as_u64().unwrap_or(1) as i32,
        max_trades_policy: body["max_trades_policy"].as_str().unwrap_or("side").into(),
        no_new_entries_last_seconds: body["no_new_entries_last_seconds"].as_u64().unwrap_or(10) as i32,
        keep_sell_orders_after_expiry_seconds: body["keep_sell_orders_after_expiry_seconds"].as_u64().unwrap_or(10) as i32,
        reconcile_interval_cycles: body["reconcile_interval_cycles"].as_u64().unwrap_or(8) as i32,
        min_spread_required: body["min_spread_required"].as_f64().map(|v| v as f32),
        strict_passive_only: body["strict_passive_only"].as_bool().unwrap_or(true),
        allow_both_sides: body["allow_both_sides"].as_bool().unwrap_or(true),
        cancel_open_buys_on_expiry: body["cancel_open_buys_on_expiry"].as_bool().unwrap_or(true),
        auto_reentry_enabled: body["auto_reentry_enabled"].as_bool().unwrap_or(false),
        max_drawdown_usdc: body["max_drawdown_usdc"].as_f64().unwrap_or(50.0) as f32,
    };

    match poly_db::vaults::upsert_strategy(pool, &config).await {
        Ok(()) => Ok(Json(json!({ "status": "updated", "vault_id": id }))),
        Err(e) => {
            tracing::error!("Update config error: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn delete_vault(
    State(engine): State<Arc<TradingEngine>>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let pool = get_pool(&engine);
    match poly_db::vaults::delete(pool, &id).await {
        Ok(()) => Ok(StatusCode::NO_CONTENT),
        Err(e) => {
            tracing::error!("Delete vault error: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn update_vault(
    State(engine): State<Arc<TradingEngine>>,
    Path(id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    let pool = get_pool(&engine);
    let vault = poly_types::vault::Vault {
        id,
        name: body["name"].as_str().unwrap_or("New Vault").into(),
        wallet_address: body["wallet_address"].as_str().map(String::from),
        strategy: body.get("strategy").cloned().unwrap_or(json!({})),
        funding: body.get("funding").cloned().unwrap_or(json!({})),
        inventory: body.get("inventory").cloned().unwrap_or(json!({})),
        stats: body.get("stats").cloned().unwrap_or(json!({})),
        mode: body.get("mode").and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default(),
        token_balance: body["token_balance"].as_i64().unwrap_or(0) as i32,
        active_market: body.get("active_market").cloned(),
        sparkline: body.get("sparkline").cloned(),
        created: body["created"].as_i64().unwrap_or_else(|| chrono::Utc::now().timestamp_millis()),
    };

    match poly_db::vaults::update(pool, &vault).await {
        Ok(()) => Ok(Json(json!({ "vault": vault }))),
        Err(e) => {
            tracing::error!("Update vault error: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn get_config(
    State(engine): State<Arc<TradingEngine>>,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let pool = get_pool(&engine);
    match poly_db::vaults::get_strategy_config(pool, &id).await {
        Ok(Some(config)) => Ok(Json(json!({ "config": config }))),
        Ok(None) => Ok(Json(json!({ "config": poly_types::vault::StrategyConfig::default() }))),
        Err(e) => {
            tracing::error!("Get config error: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn get_engine_run(
    State(engine): State<Arc<TradingEngine>>,
    Path(vault_id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let pool = get_pool(&engine);
    match poly_db::engine_runs::get_active(pool, &vault_id).await {
        Ok(Some(run)) => Ok(Json(json!({ "run": run }))),
        Ok(None) => Ok(Json(json!({ "run": null }))),
        Err(e) => {
            tracing::error!("Get engine run error: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn get_market_state(
    State(engine): State<Arc<TradingEngine>>,
    Path(vault_id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let pool = get_pool(&engine);
    match poly_db::market_states::get(pool, &vault_id).await {
        Ok(Some(state)) => Ok(Json(json!({ "market_state": state }))),
        Ok(None) => Ok(Json(json!({ "market_state": null }))),
        Err(e) => {
            tracing::error!("Get market state error: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn get_books(
    State(engine): State<Arc<TradingEngine>>,
    Path(vault_id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let pool = get_pool(&engine);
    match poly_db::books::get(pool, &vault_id).await {
        Ok(Some(books)) => Ok(Json(json!({ "books": books }))),
        Ok(None) => Ok(Json(json!({ "books": null }))),
        Err(e) => {
            tracing::error!("Get books error: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

fn get_pool(engine: &TradingEngine) -> &sqlx::PgPool {
    engine.pool()
}

async fn get_agent_address(
    State(engine): State<Arc<TradingEngine>>,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let pool = get_pool(&engine);
    match poly_db::keypairs::get_address(pool, &id).await {
        Ok(Some(address)) => Ok(Json(json!({ "vault_id": id, "agent_address": address }))),
        Ok(None) => Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Get agent address error: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn get_balance(
    State(engine): State<Arc<TradingEngine>>,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let pool = get_pool(&engine);
    let config = engine.config();

    let address = poly_db::keypairs::get_address(pool, &id)
        .await
        .map_err(|e| {
            tracing::error!("Get address for balance error: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or(StatusCode::NOT_FOUND)?;

    match poly_market::onchain::get_usdc_balance(
        &config.polygon_rpc_url,
        &config.polygon_usdc_address,
        &address,
    )
    .await
    {
        Ok(balance) => Ok(Json(json!({
            "vault_id": id,
            "agent_address": address,
            "usdc_balance": balance,
        }))),
        Err(e) => {
            tracing::error!("Get on-chain balance error: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn withdraw(
    State(engine): State<Arc<TradingEngine>>,
    Path(id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    let pool = get_pool(&engine);
    let config = engine.config();

    let recipient = body["recipient"]
        .as_str()
        .ok_or_else(|| StatusCode::BAD_REQUEST)?;
    let amount = body["amount"]
        .as_str()
        .ok_or_else(|| StatusCode::BAD_REQUEST)?;

    let private_key = poly_db::keypairs::decrypt_for_signing(
        pool,
        &id,
        &config.vault_encryption_key,
    )
    .await
    .map_err(|e| {
        tracing::error!("Decrypt key for withdrawal error: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    match poly_market::onchain::transfer_usdc(
        &config.polygon_rpc_url,
        &config.polygon_usdc_address,
        &private_key,
        recipient,
        amount,
    )
    .await
    {
        Ok(tx_hash) => Ok(Json(json!({
            "vault_id": id,
            "tx_hash": tx_hash,
            "recipient": recipient,
            "amount": amount,
        }))),
        Err(e) => {
            tracing::error!("Withdraw transfer error: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}
