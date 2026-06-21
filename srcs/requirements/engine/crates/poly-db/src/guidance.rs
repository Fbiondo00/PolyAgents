use anyhow::Result;
use sqlx::PgPool;

/// Get the current active guidance text for a vault ("" if none set).
/// This is the contextual advice the engine's AI reads each cycle — the
/// closed-loop channel from OpenClaw reflection back into trading.
pub async fn get(pool: &PgPool, vault_id: &str) -> Result<String> {
    let row: Option<(String,)> =
        sqlx::query_as("SELECT guidance FROM active_guidance WHERE vault_id = $1")
            .bind(vault_id)
            .fetch_optional(pool)
            .await?;
    Ok(row.map(|(g,)| g).unwrap_or_default())
}

/// Set (upsert) the active guidance for a vault. Empty string clears it.
pub async fn set(pool: &PgPool, vault_id: &str, guidance: &str, updated_at: i64) -> Result<()> {
    sqlx::query(
        "INSERT INTO active_guidance (vault_id, guidance, updated_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (vault_id) DO UPDATE SET guidance = $2, updated_at = $3",
    )
    .bind(vault_id)
    .bind(guidance)
    .bind(updated_at)
    .execute(pool)
    .await?;
    Ok(())
}
