use anyhow::Result;
use sqlx::PgPool;

use poly_types::engine::CachedBooks;

pub async fn get(pool: &PgPool, vault_id: &str) -> Result<Option<CachedBooks>> {
    let row = sqlx::query_as::<_, BooksRow>(
        "SELECT vault_id, books, updated_at FROM cached_books WHERE vault_id = $1"
    )
    .bind(vault_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| CachedBooks {
        vault_id: r.vault_id,
        books: r.books,
        updated_at: r.updated_at,
    }))
}

pub async fn upsert(pool: &PgPool, books: &CachedBooks) -> Result<()> {
    sqlx::query(
        "INSERT INTO cached_books (vault_id, books, updated_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (vault_id) DO UPDATE SET books = $2, updated_at = $3"
    )
    .bind(&books.vault_id)
    .bind(&books.books)
    .bind(books.updated_at)
    .execute(pool)
    .await?;
    Ok(())
}

#[derive(sqlx::FromRow)]
struct BooksRow {
    vault_id: String,
    books: serde_json::Value,
    updated_at: i64,
}
