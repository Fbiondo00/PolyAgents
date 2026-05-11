use std::sync::Arc;

use anyhow::Result;
use rmcp::ServiceExt;

mod params;
mod server;
mod state;

use poly_ai::AiClient;
use poly_db::create_pool;
use poly_engine::TradingEngine;
use poly_market::PolymarketAdapter;
use poly_types::config::AppConfig;

use server::PolyMcpServer;
use state::EngineState;

#[tokio::main]
async fn main() -> Result<()> {
    // Log to stderr — stdout is reserved for MCP protocol
    tracing_subscriber::fmt()
        .with_env_filter("poly_mcp=info,poly_engine=info,poly_market=info,poly_ai=info")
        .with_writer(std::io::stderr)
        .with_ansi(false)
        .init();

    tracing::info!("Starting PolyAgents MCP server");

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432/postgres".into());

    let config = AppConfig {
        database_url: database_url.clone(),
        polymarket: poly_types::config::PolymarketConfig {
            api_key: std::env::var("POLYMARKET_API_KEY").unwrap_or_default(),
            api_secret: std::env::var("POLYMARKET_API_SECRET").unwrap_or_default(),
            api_passphrase: std::env::var("POLYMARKET_API_PASSPHRASE").unwrap_or_default(),
            private_key: std::env::var("POLYMARKET_PRIVATE_KEY").unwrap_or_default(),
            funder_private_key: std::env::var("POLYMARKET_FUNDER_PRIVATE_KEY").unwrap_or_default(),
            live: std::env::var("POLYMARKET_LIVE")
                .unwrap_or_default()
                .parse()
                .unwrap_or(false),
            chain_id: std::env::var("POLYMARKET_CHAIN_ID")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(137),
        },
        ai: poly_types::config::AiConfig {
            api_base: std::env::var("OPENAI_API_BASE")
                .unwrap_or_else(|_| "https://openai.pezserv.org".into()),
            api_key: std::env::var("OPENAI_API_KEY").unwrap_or_default(),
            model: std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "gpt-4o".into()),
            max_tokens: std::env::var("OPENAI_MAX_TOKENS")
                .unwrap_or_else(|_| "1024".into())
                .parse()?,
        },
        server: poly_types::config::ServerConfig {
            host: "0.0.0.0".into(),
            port: 8080,
        },
    };

    tracing::info!("Connecting to database...");
    let pool = create_pool(&database_url).await?;

    tracing::info!("Running migrations...");
    sqlx::migrate!("../../migrations").run(&pool).await?;

    let http = reqwest::Client::new();
    let market = PolymarketAdapter::new(&config.polymarket, http);
    let ai = AiClient::new(config.ai.clone());

    let engine = TradingEngine::new(config, pool, market, ai);
    let state = Arc::new(EngineState::new(engine));
    let server = PolyMcpServer::new(state);

    tracing::info!("MCP server ready, listening on stdio");

    let service = server.serve(rmcp::transport::stdio()).await?;

    // Block until stdin closes (client disconnect)
    service.waiting().await?;

    tracing::info!("Client disconnected, shutting down");
    Ok(())
}
