export interface LlmUsage {
  promptTokens: number
  completionTokens: number
  costUsd: number
  costHbar: number
}

export interface TradeDecision {
  shouldTrade: boolean
  direction: "YES" | "NO" | "BOTH" | "NONE"
  confidence: number        // 0-1
  reasoning: string
  suggestedSize: number     // USDC amount
  usage?: LlmUsage
}

export interface MarketContext {
  question: string
  currentOdds: { yes: number; no: number }
  timeToExpiry: number
  inventory: { upShares: number; downShares: number }
  recentPnl: number
  orderBook: { yesBid: number; yesAsk: number; noBid: number; noAsk: number }
}
