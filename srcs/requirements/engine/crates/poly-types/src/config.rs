use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::fmt;

/// The literal placeholder shipped in `.env` / `.env.example` for secrets the
/// deployer must generate themselves. It is never a usable value and must be
/// rejected at startup rather than silently accepted.
const PLACEHOLDER_SENTINEL: &str = "<GENERATE_WITH_openssl_rand_-hex_32>";

/// Constant returned by every redacted `Debug` field so a single grep tells
/// you whether a key slipped through.
const REDACTED: &str = "[REDACTED]";

#[derive(Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub database_url: String,
    pub polymarket: PolymarketConfig,
    pub ai: AiConfig,
    pub server: ServerConfig,
    pub vault_encryption_key: String,
    pub polygon_rpc_url: String,
    pub polygon_usdc_address: String,
}

impl fmt::Debug for AppConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("AppConfig")
            .field("database_url", &self.database_url)
            .field("polymarket", &self.polymarket)
            .field("ai", &self.ai)
            .field("server", &self.server)
            // Master vault encryption key -- never emit the real value.
            .field("vault_encryption_key", &REDACTED)
            .field("polygon_rpc_url", &self.polygon_rpc_url)
            .field("polygon_usdc_address", &self.polygon_usdc_address)
            .finish()
    }
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

        // VAULT_ENCRYPTION_KEY is required: it is the master AES-256-GCM key
        // used to encrypt per-vault private keys (`poly-db::keypairs` hex-decodes
        // it into a 32-byte key). An empty string, the shipped `.env` placeholder,
        // or any value that is not exactly 64 hex chars (32 bytes) would either
        // silently encrypt vaults with a known/garbage key or crash at first use.
        // Fail fast at startup instead.
        let vault_encryption_key = parse_vault_encryption_key(&std::env::var("VAULT_ENCRYPTION_KEY")?)?;

        Ok(Self {
            database_url,
            polymarket,
            ai,
            server: ServerConfig::default(),
            vault_encryption_key,
            polygon_rpc_url: std::env::var("POLYGON_RPC_URL")
                .unwrap_or_else(|_| "https://polygon-rpc.com".into()),
            polygon_usdc_address: std::env::var("POLYGON_USDC_ADDRESS")
                .unwrap_or_else(|_| "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359".into()),
        })
    }
}

/// Validate the master vault encryption key at startup.
///
/// The key must be a hex-encoded 32-byte (64 char) AES-256 key. We reject:
///   * unset / empty values (the env var is now mandatory),
///   * the literal `<GENERATE_WITH_openssl_rand_-hex_32>` placeholder shipped
///     in `.env` / `.env.example`,
///   * anything that is not 64 hex characters (so a deploy with `abc123`
///     fails cleanly here instead of panicking inside
///     `Aes256Gcm::new_from_slice` on first vault access).
///
/// We intentionally avoid pulling the `hex` crate into `poly-types` (the
/// authoritative `hex::decode` already happens in `poly-db::keypairs`); this
/// guard only needs to confirm shape so misconfiguration is caught at boot.
fn parse_vault_encryption_key(raw: &str) -> Result<String> {
    if raw.trim().is_empty() {
        return Err(anyhow!(
            "VAULT_ENCRYPTION_KEY is required but was empty. Generate one with \
             `openssl rand -hex 32` and set it before starting the engine."
        ));
    }
    if raw == PLACEHOLDER_SENTINEL {
        return Err(anyhow!(
            "VAULT_ENCRYPTION_KEY is still set to the placeholder \
             '{PLACEHOLDER_SENTINEL}'. Generate a real key with \
             `openssl rand -hex 32` and set it before starting the engine."
        ));
    }
    let is_valid_hex_32 = raw.len() == 64 && raw.as_bytes().iter().all(|b| b.is_ascii_hexdigit());
    if is_valid_hex_32 {
        Ok(raw.to_owned())
    } else {
        Err(anyhow!(
            "VAULT_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes) \
             for AES-256-GCM, generated with e.g. `openssl rand -hex 32`. \
             Got a {}-char value that is not a valid 32-byte hex key.",
            raw.len()
        ))
    }
}

#[derive(Clone, Default, Serialize, Deserialize)]
pub struct PolymarketConfig {
    pub api_key: String,
    pub api_secret: String,
    pub api_passphrase: String,
    pub private_key: String,
    pub funder_private_key: String,
    pub live: bool,
    pub chain_id: u64,
}

impl fmt::Debug for PolymarketConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("PolymarketConfig")
            .field("api_key", &REDACTED)
            .field("api_secret", &REDACTED)
            .field("api_passphrase", &REDACTED)
            .field("private_key", &REDACTED)
            .field("funder_private_key", &REDACTED)
            .field("live", &self.live)
            .field("chain_id", &self.chain_id)
            .finish()
    }
}

#[derive(Clone, Serialize, Deserialize)]
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

impl fmt::Debug for AiConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("AiConfig")
            .field("api_base", &self.api_base)
            // Bearer secret key for the AI gateway -- never emit it.
            .field("api_key", &REDACTED)
            // `public_key` is the non-secret Langfuse public id, so it is safe
            // to print; only the bearer `api_key` above is redacted.
            .field("public_key", &self.public_key)
            .field("model", &self.model)
            .field("max_tokens", &self.max_tokens)
            .finish()
    }
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
