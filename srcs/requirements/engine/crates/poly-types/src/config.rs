use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub database_url: String,
    pub polymarket: PolymarketConfig,
    pub ai: AiConfig,
    pub server: ServerConfig,
    pub vault_encryption_key: String,
    pub polygon_rpc_url: String,
    pub polygon_usdc_address: String,
}

impl AppConfig {
    /// Load the full configuration from environment variables.
    ///
    /// Single source of truth shared by both binaries (`engine` and `poly-mcp`),
    /// so they can never drift apart on defaults or field set. The `engine` binary
    /// overrides `server` from its clap args after calling this.
    pub fn from_env() -> Result<Self> {
        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432/postgres".into());

        let polymarket = PolymarketConfig {
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
        };

        let ai = AiConfig {
            api_base: std::env::var("OPENAI_API_BASE")
                .unwrap_or_else(|_| "https://openai.craftshost.com".into()),
            api_key: std::env::var("OPENAI_API_KEY").unwrap_or_default(),
            // Treat an empty/unset value as "no public key" so we never send a blank
            // X-Langfuse-Public-Key header (which the gateway would reject).
            public_key: std::env::var("OPENAI_PUBLIC_KEY")
                .ok()
                .filter(|s| !s.is_empty()),
            model: std::env::var("OPENAI_API_MODEL")
                .or_else(|_| std::env::var("OPENAI_MODEL"))
                .unwrap_or_else(|_| "gemma4:12b".into()),
            max_tokens: std::env::var("OPENAI_MAX_TOKENS")
                .unwrap_or_else(|_| "4096".into())
                .parse()?,
        };

        Ok(Self {
            database_url,
            polymarket,
            ai,
            server: ServerConfig::default(),
            vault_encryption_key: std::env::var("VAULT_ENCRYPTION_KEY").unwrap_or_default(),
            polygon_rpc_url: std::env::var("POLYGON_RPC_URL")
                .unwrap_or_else(|_| "https://polygon-rpc.com".into()),
            polygon_usdc_address: std::env::var("POLYGON_USDC_ADDRESS")
                .unwrap_or_else(|_| "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359".into()),
        })
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PolymarketConfig {
    pub api_key: String,
    pub api_secret: String,
    pub api_passphrase: String,
    pub private_key: String,
    pub funder_private_key: String,
    pub live: bool,
    pub chain_id: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiConfig {
    pub api_base: String,
    pub api_key: String,
    /// Optional public key for gateways that require it (e.g. Langfuse-routed Craftshost,
    /// which expects an `X-Langfuse-Public-Key` header alongside the bearer secret key).
    #[serde(default)]
    pub public_key: Option<String>,
    pub model: String,
    pub max_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            host: "0.0.0.0".into(),
            port: 8080,
        }
    }
}
