use poly_engine::TradingEngine;

pub struct EngineState {
    pub engine: TradingEngine,
}

impl EngineState {
    pub fn new(engine: TradingEngine) -> Self {
        Self { engine }
    }
}
