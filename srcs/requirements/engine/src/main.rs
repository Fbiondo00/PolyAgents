use anyhow::Result;
use axum::{
    extract::{Path, Request, State},
    Extension,
    http::StatusCode,
    middleware::{from_fn_with_state, Next},
    routing::{get, post},
    Json, Router,
};
use clap::Parser;
use serde_json::{json, Value};
use std::sync::Arc;
use tower_http::cors::{AllowOrigin, CorsLayer};

use poly_ai::AiClient;
use poly_db::create_pool;
use poly_engine::TradingEngine;
use poly_market::{MarketAdapter, PolymarketAdapter};
use poly_types::config::AppConfig;

#[derive(Parser)]
#[command(name = "polyagents-engine", about = "PolyAgents trading engine")]
struct Cli {
    /// Config file path
    #[arg(short, long, default_value = ".env")]
    config: String,

    /// Host to bind. Defaults to loopback (127.0.0.1) so the engine — which moves
    /// real USDC — is never exposed to the network by accident. Pass `--host
    /// 0.0.0.0` (or a specific interface) to bind externally, and pair it with
    /// `ENGINE_API_TOKEN` + a restrictive CORS policy.
    #[arg(long, default_value = "127.0.0.1")]
    host: String,

    /// Port to bind
    #[arg(short, long, default_value_t = 8080)]
    port: u16,
}

/// Shared authorization state for the money-moving route group.
///
/// `expected_token` is `None` when `ENGINE_API_TOKEN` is unset; in that mode
/// the middleware rejects every protected request (fail-closed) rather than
/// silently allowing unauthenticated fund movement.
#[derive(Clone)]
struct AuthState {
    expected_token: Option<String>,
}

/// Authorization middleware: requires a `Authorization: Bearer <token>` header
/// whose token matches `ENGINE_API_TOKEN` exactly (constant-time comparison).
/// Mounted only on the protected route group via `from_fn_with_state`.
async fn require_api_token(
    State(auth): State<Arc<AuthState>>,
    request: Request,
    next: Next,
) -> Result<axum::response::Response, StatusCode> {
    use axum::http::header::AUTHORIZATION;

    let expected = match &auth.expected_token {
        Some(t) => t,
        // No token configured → fail-closed. The startup log warns about this.
        None => {
            tracing::warn!("Protected route hit with no ENGINE_API_TOKEN configured");
            return Err(StatusCode::FORBIDDEN);
        }
    };

    let provided = request
        .headers()
        .get(AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))
        .map(str::trim);

    match provided {
        Some(p) if constant_time_eq(p.as_bytes(), expected.as_bytes()) => Ok(next.run(request).await),
        _ => {
            tracing::warn!("Rejected protected request: missing or invalid API token");
            Err(StatusCode::UNAUTHORIZED)
        }
    }
}

/// Constant-time byte comparison to avoid timing side-channels on the token.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Build the CORS layer from `ENGINE_CORS_ORIGINS` (comma-separated). Defaults
/// to a loopback-only policy. `*` explicitly opts into a permissive policy
/// (intended only behind an authenticating reverse proxy).
fn build_cors_layer() -> CorsLayer {
    let raw = std::env::var("ENGINE_CORS_ORIGINS").unwrap_or_default();
    let origins: Vec<&str> = raw
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect();

    let allow_origin = match origins.as_slice() {
        // Default: loopback only — safe for local dev, never exposes the fund-
        // moving API to arbitrary cross-origin browsers.
        [] => AllowOrigin::list([
            "http://localhost:3000".parse::<axum::http::HeaderValue>().unwrap(),
            "http://127.0.0.1:3000".parse::<axum::http::HeaderValue>().unwrap(),
        ]),
        // Explicit wildcard: caller takes responsibility (documented above).
        [single] if *single == "*" => AllowOrigin::mirror_request(),
        // Explicit allow-list.
        list => {
            let parsed: Vec<axum::http::HeaderValue> = list
                .iter()
                .filter_map(|o| o.parse::<axum::http::HeaderValue>().ok())
                .collect();
            AllowOrigin::list(parsed)
        }
    };

    CorsLayer::new()
        .allow_origin(allow_origin)
        .allow_methods([
            axum::http::Method::GET,
            axum::http::Method::POST,
            axum::http::Method::PUT,
            axum::http::Method::DELETE,
            axum::http::Method::OPTIONS,
        ])
        .allow_headers([axum::http::header::AUTHORIZATION, axum::http::header::CONTENT_TYPE])
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
    // One adapter drives the engine; a second (stateless) adapter is attached to
    // the HTTP router as an Extension so the cancel_orders handler can issue live
    // CLOB cancels. Both wrap the same reqwest::Client + PolymarketConfig, so the
    // duplicate is cheap and shares connection pooling.
    let ai = AiClient::new(config.ai.clone());
    let market_for_router = Arc::new(PolymarketAdapter::new(&config.polymarket, http.clone()));
    let market_for_engine = PolymarketAdapter::new(&config.polymarket, http);

    let engine = Arc::new(TradingEngine::new(config, pool, market_for_engine, ai));

    // Spawn the reconciliation loop: closes out OPEN trade outcomes (fills +
    // PnL) once their markets resolve. Runs for the process lifetime.
    engine.spawn_reconciler();

    // Authorization: every state- or money-mutating route is gated behind a
    // shared bearer token (`ENGINE_API_TOKEN`). Read-only inspection routes
    // (status, orders, pnl, audit, market-state, books, balance) remain open
    // for dashboards. If no token is configured the protected routes refuse
    // every request (fail-closed) and we log a loud warning at startup so a
    // misconfigured deploy cannot silently run unprotected.
    let api_token = std::env::var("ENGINE_API_TOKEN")
        .ok()
        .filter(|s| !s.is_empty());
    if api_token.is_none() {
        tracing::warn!(
            "ENGINE_API_TOKEN is unset — all money/state-mutating routes will reject requests. \
             Set ENGINE_API_TOKEN to enable withdrawals, vault mutations, and engine control."
        );
    }
    let auth_state = Arc::new(AuthState {
        expected_token: api_token,
    });

    // CORS is configurable via ENGINE_CORS_ORIGINS (comma-separated). The
    // default is the most restrictive safe policy: only loopback origins are
    // allowed. There is intentionally no permissive fallback — this API moves
    // real USDC, so a wildcard CORS policy would be a cross-site fund-drain
    // vector. Use `ENGINE_CORS_ORIGINS=*` only behind a locked-down reverse
    // proxy that adds its own auth.
    let cors = build_cors_layer();

    // Public routes: liveness + read-only inspection (no secrets, no mutations).
    // These intentionally sit OUTSIDE the auth middleware so dashboards and
    // orchestrator healthchecks can reach them without a bearer token.
    let public = Router::new()
        .route("/health", get(health))
        .route("/engine/{vault_id}/status", get(engine_status))
        .route("/engine/active", get(active_engines))
        .route("/engine-runs/{vault_id}", get(get_engine_run))
        .route("/orders/{vault_id}", get(get_orders))
        .route("/pnl/{vault_id}", get(get_pnl))
        .route("/audit/{vault_id}", get(get_audit))
        .route("/market-state/{vault_id}", get(get_market_state))
        .route("/books/{vault_id}", get(get_books))
        .route("/vaults/{id}/agent-address", get(get_agent_address))
        .route("/vaults/{id}/balance", get(get_balance))
        .with_state(engine.clone());

    // Protected routes: anything that creates/deletes/updates a vault, mutates
    // strategy config, controls the engine, cancels orders, or moves funds. The
    // auth middleware is applied to THIS router only, then it is merged with the
    // public router — so axum routes auth per-path rather than globally.
    let protected = Router::new()
        .route("/vaults", get(list_vaults).post(create_vault))
        .route("/vaults/{id}", get(get_vault).put(update_vault).delete(delete_vault))
        .route("/vaults/{id}/config", get(get_config).put(update_config))
        .route("/vaults/{id}/withdraw", post(withdraw))
        .route("/engine/{vault_id}/start", post(start_engine))
        .route("/engine/{vault_id}/stop", post(stop_engine))
        .route("/engine/{vault_id}/cancel-orders", post(cancel_orders))
        // The market adapter is attached as an Extension so the cancel_orders
        // handler can cancel live CLOB orders without widening every handler's
        // State type.
        .layer(axum::Extension(market_for_router.clone()))
        .layer(from_fn_with_state(auth_state, require_api_token))
        .with_state(engine.clone());

    let app = public
        .merge(protected)
        .layer(cors);

    let addr = format!("{}:{}", cli.host, cli.port);
    if cli.host == "0.0.0.0" {
        tracing::warn!(
            "Binding to 0.0.0.0:{} — engine is reachable from every network interface. \
             Ensure ENGINE_API_TOKEN is set and CORS is locked down.",
            cli.port
        );
    }
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

/// Liveness + readiness: returns 503 if the database is unreachable so an
/// orchestrator's `depends_on: condition: service_healthy` actually blocks
/// downstream services until the engine can serve real traffic, not just until
/// the TCP socket is open.
async fn health(State(engine): State<Arc<TradingEngine>>) -> Result<Json<Value>, StatusCode> {
    let pool = get_pool(&engine);
    // Cheapest round-trip that proves the pool has a live Postgres connection.
    match sqlx::query("SELECT 1").execute(pool).await {
        Ok(_) => Ok(Json(json!({
            "status": "ok",
            "service": "polyagents-engine",
            "database": "ok",
        }))),
        Err(e) => {
            tracing::error!("Health check database probe failed: {}", e);
            Err(StatusCode::SERVICE_UNAVAILABLE)
        }
    }
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
    Extension(market): Extension<Arc<PolymarketAdapter>>,
    Path(vault_id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let pool = get_pool(&engine);

    // Read open orders first so we can cancel each live one on the CLOB before
    // flipping their DB status. Previously this handler only *read* the orders
    // and returned the count, leaving both the venue and the DB untouched — a
    // no-op that silently lied about having cancelled anything.
    let orders = poly_db::orders::get_open_by_vault(pool, &vault_id)
        .await
        .map_err(|e| {
            tracing::error!("Cancel orders (read) error: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let mut clob_cancelled = 0usize;
    let mut clob_failed = 0usize;

    for order in &orders {
        // Simulated orders never reached the CLOB (`POLYMARKET_LIVE=false`), so
        // there is nothing to cancel there — only the DB row needs updating,
        // which cancel_by_vault handles below.
        if order.simulated {
            continue;
        }
        match market.cancel_order(&order.id).await {
            Ok(()) => clob_cancelled += 1,
            Err(e) => {
                // Don't abort the whole sweep on one bad cancel: still mark the
                // DB row cancelled locally so the operator can reconcile.
                clob_failed += 1;
                tracing::warn!(
                    vault_id = vault_id,
                    order_id = %order.id,
                    error = %e,
                    "CLOB cancel failed (will still mark DB cancelled)"
                );
            }
        }
    }

    // Flip every OPEN/PARTIALLY_FILLED row for this vault to CANCELLED.
    let db_cancelled = poly_db::orders::cancel_by_vault(pool, &vault_id)
        .await
        .map_err(|e| {
            tracing::error!("Cancel orders (db) error: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    tracing::info!(
        vault_id = vault_id,
        open_orders = orders.len(),
        clob_cancelled,
        clob_failed,
        db_rows_cancelled = db_cancelled,
        "Cancelled open orders"
    );

    Ok(Json(json!({
        "vault_id": vault_id,
        "open_orders": orders.len(),
        "clob_cancelled": clob_cancelled,
        "clob_failed": clob_failed,
        "db_rows_cancelled": db_cancelled,
        "status": "ok"
    })))
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
        .ok_or(StatusCode::BAD_REQUEST)?;
    let amount = body["amount"]
        .as_str()
        .ok_or(StatusCode::BAD_REQUEST)?;

    // Validate the recipient looks like an EVM address before doing any key
    // work. Rejects empty/garbage strings that previously would have been
    // forwarded straight to the transfer builder.
    let recipient = recipient.trim();
    if !(recipient.starts_with("0x") && recipient.len() == 42) {
        tracing::warn!(recipient = recipient, "Withdraw rejected: invalid recipient");
        return Err(StatusCode::BAD_REQUEST);
    }

    // Validate the amount is a positive finite number. Previously any string
    // (including "" or "abc") was forwarded to the transfer builder; only a
    // late f64 parse there would catch it, and there was no upper bound at all.
    let amount_f: f64 = amount.parse().map_err(|_| {
        tracing::warn!(amount = amount, "Withdraw rejected: amount is not a number");
        StatusCode::BAD_REQUEST
    })?;
    if !amount_f.is_finite() || amount_f <= 0.0 {
        tracing::warn!(amount = amount, "Withdraw rejected: amount must be > 0");
        return Err(StatusCode::BAD_REQUEST);
    }
    // Per-withdraw sanity ceiling to stop a single call from draining an
    // unexpectedly large balance (e.g. a misconfigured funder top-up). Override
    // via ENGINE_MAX_WITHDRAW_USDC if a vault legitimately needs more.
    let max_withdraw: f64 = std::env::var("ENGINE_MAX_WITHDRAW_USDC")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(1_000.0);
    if amount_f > max_withdraw {
        tracing::warn!(
            amount = amount,
            max = max_withdraw,
            "Withdraw rejected: exceeds ENGINE_MAX_WITHDRAW_USDC"
        );
        return Err(StatusCode::BAD_REQUEST);
    }

    // Decrypt the per-vault signing key.
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

    // Fetch the agent's on-chain USDC balance and refuse overdrafts. This runs
    // *after* key decryption so an unauthorized caller (blocked by the auth
    // middleware) cannot probe balances, but before broadcasting the transfer.
    let agent_address = poly_db::keypairs::get_address(pool, &id)
        .await
        .map_err(|e| {
            tracing::error!("Get address for withdrawal error: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or(StatusCode::NOT_FOUND)?;

    let balance_str = poly_market::onchain::get_usdc_balance(
        &config.polygon_rpc_url,
        &config.polygon_usdc_address,
        &agent_address,
    )
    .await
    .map_err(|e| {
        tracing::error!("Balance check for withdrawal error: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    let balance_f: f64 = balance_str.parse().unwrap_or(0.0);
    if amount_f > balance_f {
        tracing::warn!(
            vault_id = id,
            amount = amount,
            balance = balance_str,
            "Withdraw rejected: amount exceeds on-chain balance"
        );
        return Err(StatusCode::BAD_REQUEST);
    }

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
