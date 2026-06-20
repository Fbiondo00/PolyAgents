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

    let config = AppConfig::from_env()?;
    let database_url = config.database_url.clone();

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
