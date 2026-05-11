use anyhow::Result;
use sqlx::PgPool;

use poly_types::market::AuditEvent;

pub async fn insert(pool: &PgPool, event: &AuditEvent) -> Result<()> {
    sqlx::query(
        "INSERT INTO audit_events (vault_id, type, timestamp, data)
         VALUES ($1, $2, $3, $4)"
    )
    .bind(&event.vault_id)
    .bind(&event.event_type)
    .bind(event.timestamp)
    .bind(&event.data)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_by_vault(pool: &PgPool, vault_id: &str, limit: i64) -> Result<Vec<AuditEvent>> {
    let rows = sqlx::query_as::<_, AuditRow>(
        "SELECT id, vault_id, type, timestamp, data
         FROM audit_events WHERE vault_id = $1
         ORDER BY timestamp DESC LIMIT $2"
    )
    .bind(vault_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(|r| r.into_event()).collect())
}

#[derive(sqlx::FromRow)]
struct AuditRow {
    id: i64,
    vault_id: String,
    r#type: String,
    timestamp: i64,
    data: Option<serde_json::Value>,
}

impl AuditRow {
    fn into_event(self) -> AuditEvent {
        AuditEvent {
            id: Some(self.id),
            vault_id: self.vault_id,
            event_type: self.r#type,
            timestamp: self.timestamp,
            data: self.data,
        }
    }
}
