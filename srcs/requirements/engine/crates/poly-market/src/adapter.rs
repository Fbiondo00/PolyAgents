use anyhow::Result;
use async_trait::async_trait;
use rust_decimal::Decimal;
use tokio::sync::mpsc;

use poly_types::config::PolymarketConfig;
use poly_types::market::{BookUpdate, Market, MarketParams};
use poly_types::order::{NewOrder, OrderResult};

use crate::clob::ClobClient;
use crate::gamma::GammaClient;

pub struct PolymarketAdapter {
    gamma: GammaClient,
    clob: ClobClient,
}

impl PolymarketAdapter {
    pub fn new(config: &PolymarketConfig, http: reqwest::Client) -> Self {
        Self {
            gamma: GammaClient::new(http.clone()),
            clob: ClobClient::new(config, http),
        }
    }
}

#[async_trait]
impl MarketAdapter for PolymarketAdapter {
    async fn discover_market(&self, params: MarketParams) -> Result<Market> {
        self.gamma.search_markets(params).await
    }

    async fn get_book_top(&self, market_id: &str) -> Result<(Decimal, Decimal)> {
        let book = self.clob.get_order_book(market_id).await?;
        let best_bid = book.bids.first().map(|l| l.price).unwrap_or(Decimal::ZERO);
        let best_ask = book.asks.first().map(|l| l.price).unwrap_or(Decimal::ONE);
        Ok((best_bid, best_ask))
    }

    async fn subscribe_book(
        &self,
        market_id: &str,
    ) -> Result<mpsc::Receiver<BookUpdate>> {
        crate::websocket::subscribe_order_book(market_id).await
    }

    async fn place_order(&self, order: NewOrder) -> Result<OrderResult> {
        self.clob.place_order(order).await
    }

    async fn place_order_with_key(&self, order: NewOrder, private_key: &str) -> Result<OrderResult> {
        self.clob.place_order_with_key(order, private_key).await
    }

    async fn cancel_order(&self, order_id: &str) -> Result<()> {
        self.clob.cancel_order(order_id).await
    }

    async fn get_market(&self, condition_id: &str) -> Result<Market> {
        self.gamma.get_market(condition_id).await
    }

    async fn get_order(&self, order_id: &str) -> Result<crate::clob::OrderState> {
        self.clob.get_order(order_id).await
    }
}

#[async_trait]
pub trait MarketAdapter: Send + Sync {
    async fn discover_market(&self, params: MarketParams) -> Result<Market>;
    async fn get_book_top(&self, market_id: &str) -> Result<(Decimal, Decimal)>;
    async fn subscribe_book(
        &self,
        market_id: &str,
    ) -> Result<mpsc::Receiver<BookUpdate>>;
    async fn place_order(&self, order: NewOrder) -> Result<OrderResult>;
    async fn place_order_with_key(&self, order: NewOrder, private_key: &str) -> Result<OrderResult>;
    async fn cancel_order(&self, order_id: &str) -> Result<()>;
    async fn get_market(&self, condition_id: &str) -> Result<Market>;
    async fn get_order(&self, order_id: &str) -> Result<crate::clob::OrderState>;
}
