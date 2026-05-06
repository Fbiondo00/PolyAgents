import type { TradeDecision } from "./trade-decision"

export interface CycleUpdate {
  step: string
  vaultId: string
  timestamp: number
  data?: Record<string, unknown>
}

export interface ActiveMarketData {
  question: string
  slug: string
  endTs: number
  conditionId: string
  yesTokenId: string
  noTokenId: string
  yesBook: { bestBid: number | null; bestAsk: number | null }
  noBook: { bestBid: number | null; bestAsk: number | null }
  isLive: boolean
  toExpiry: number
}

export interface CycleResult {
  success: boolean
  status: "completed" | "no_market" | "error"
  fills: number
  pnl: number
  reasoning?: string
  error?: string
  decision?: TradeDecision
  activeMarket?: ActiveMarketData
}

export interface DeployProgress {
  stage: string
  vaultId: string
  timestamp: number
}
