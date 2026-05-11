use anyhow::Result;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};

use poly_types::market::BookUpdate;
use rust_decimal::Decimal;

const MAX_RECONNECT_ATTEMPTS: u32 = 5;

pub async fn subscribe_order_book(
    market_id: &str,
) -> Result<mpsc::Receiver<BookUpdate>> {
    let (tx, rx) = mpsc::channel(256);

    let url = format!(
        "wss://ws-subscriptions-clob.polymarket.com/ws/market/{}",
        market_id
    );

    let market_id_owned = market_id.to_string();
    tokio::spawn(async move {
        let mut attempts = 0;
        loop {
            match connect_async(&url).await {
                Ok((ws_stream, _)) => {
                    attempts = 0;
                    let (mut write, mut read) = ws_stream.split();
                    while let Some(msg) = read.next().await {
                        match msg {
                            Ok(Message::Text(text)) => {
                                if let Ok(update) = parse_book_update(&market_id_owned, &text)
                                    && tx.send(update).await.is_err()
                                {
                                    return; // receiver dropped
                                }
                            }
                            Ok(Message::Ping(data)) => {
                                // Must respond with Pong or server disconnects
                                if let Err(e) = write.send(Message::Pong(data)).await {
                                    tracing::warn!("WS pong send failed: {}", e);
                                    break;
                                }
                            }
                            Err(e) => {
                                tracing::warn!("WebSocket read error: {}", e);
                                break;
                            }
                            _ => {}
                        }
                    }
                }
                Err(e) => {
                    tracing::error!("WebSocket connect failed: {}", e);
                }
            }

            // Reconnect with exponential backoff
            attempts += 1;
            if attempts > MAX_RECONNECT_ATTEMPTS {
                tracing::error!("Max reconnection attempts ({}) reached, giving up", MAX_RECONNECT_ATTEMPTS);
                return;
            }

            let delay = std::time::Duration::from_secs(1 << attempts.min(3));
            tracing::info!(attempt = attempts, delay_secs = delay.as_secs(), "Reconnecting WebSocket");
            tokio::time::sleep(delay).await;
        }
    });

    Ok(rx)
}

fn parse_book_update(market_id: &str, text: &str) -> Result<BookUpdate> {
    let v: serde_json::Value = serde_json::from_str(text)?;

    let side = match v["side"].as_str() {
        Some("BUY") => poly_types::market::Side::Buy,
        _ => poly_types::market::Side::Sell,
    };

    let price = v["price"]
        .as_str()
        .and_then(|s| s.parse().ok())
        .unwrap_or(Decimal::ZERO);

    let size = v["size"]
        .as_str()
        .and_then(|s| s.parse().ok())
        .unwrap_or(Decimal::ZERO);

    let is_remove = size == Decimal::ZERO;

    Ok(BookUpdate {
        market_id: market_id.into(),
        side,
        price,
        size,
        is_remove,
    })
}
