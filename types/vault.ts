export interface AuditEvent {
  id: string
  type: 'bid-placed' | 'fill' | 'sell-placed' | 'rollover' | 'reconcile' | 'ai-analysis'
  timestamp: number
  marketId?: string
  shares?: number
  price?: number
  pnl?: number
  reasoning?: string
}

export interface Vault {
  id: string
  name: string
  walletAddress?: string
  created: number
  strategy: {
    bidPrice: number
    sellPrice: number
    maxCapital: number
    trancheSize: number
    noNewEntriesLast: number
    keepSellAfter: number
    aiEnabled: boolean
  }
  funding: {
    usdc: number
    hbar: number
  }
  inventory: {
    upShares: number
    downShares: number
  }
  stats: {
    flips: number
    pnl: number
    cycles: number
  }
  audit: AuditEvent[]
  mode: 'advisory' | 'auto'
  tokenBalance: number
  activeMarket: {
    id: string
    expiry: number
    midPrice: number
  } | null
  sparkline?: number[]
  hedera?: import('./hedera').HederaContext
  hederaError?: string
}

export const DEMO_VAULT: Vault = {
  id: 'demo-1',
  name: 'BTC Scalper Demo',
  created: Date.now() - 86400000 * 3,
  strategy: {
    bidPrice: 0.01,
    sellPrice: 0.02,
    maxCapital: 100,
    trancheSize: 15,
    noNewEntriesLast: 30,
    keepSellAfter: 10,
    aiEnabled: true,
  },
  funding: { usdc: 84.62, hbar: 0.847 },
  inventory: { upShares: 23, downShares: 17 },
  stats: { flips: 127, pnl: 4.52, cycles: 342 },
  mode: 'auto',
  tokenBalance: 1,
  activeMarket: {
    id: 'btc-5m-42',
    expiry: Date.now() + 167000,
    midPrice: 0.523,
  },
  audit: [
    {
      id: 'a1',
      type: 'ai-analysis',
      timestamp: Date.now() - 60000,
      marketId: 'btc-5m-42',
      reasoning: 'Market trending bullish. RSI 62, volume spike +18%. Recommend UP tranche.',
    },
    {
      id: 'a2',
      type: 'bid-placed',
      timestamp: Date.now() - 55000,
      marketId: 'btc-5m-42',
      shares: 15,
      price: 0.01,
    },
    {
      id: 'a3',
      type: 'fill',
      timestamp: Date.now() - 45000,
      marketId: 'btc-5m-41',
      shares: 15,
      price: 0.02,
      pnl: 0.15,
    },
    {
      id: 'a4',
      type: 'sell-placed',
      timestamp: Date.now() - 40000,
      marketId: 'btc-5m-41',
      shares: 15,
      price: 0.02,
    },
    {
      id: 'a5',
      type: 'rollover',
      timestamp: Date.now() - 30000,
      marketId: 'btc-5m-40',
    },
    {
      id: 'a6',
      type: 'reconcile',
      timestamp: Date.now() - 20000,
      pnl: 0.15,
    },
  ],
  sparkline: [4.1, 4.15, 4.05, 4.2, 4.18, 4.3, 4.25, 4.35, 4.4, 4.52],
}
