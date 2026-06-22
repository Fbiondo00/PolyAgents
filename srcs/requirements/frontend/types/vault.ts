import type { StrategyConfig } from './engine-schemas'

export interface AuditEvent {
  id: string
  type: 'bid-placed' | 'fill' | 'sell-placed' | 'rollover' | 'reconcile' | 'ai-analysis'
  timestamp: number
  marketId?: string
  shares?: number
  price?: number
  pnl?: number
  reasoning?: string
  txHash?: string
}

// ── Vault.strategy <-> engine StrategyConfig field mapping ─────────────────
// The UI edits Vault.strategy (bidPrice / sellPrice / maxCapital / ...) but the
// engine's update_config endpoint expects the StrategyConfig shape
// (entryPrice / exitPrice / maxCapitalUsdc / ...). Sending Vault.strategy
// verbatim stores bidPrice/sellPrice as raw JSON, which the engine ignores so
// the user's $0.20 bid silently falls back to the $0.01 default. These helpers
// translate between the two shapes so the correct field names reach the engine.

const STRATEGY_CONFIG_DEFAULTS = {
  enabled: true,
  maxTradesPerMarket: 1,
  maxTradesPolicy: 'side' as const,
  reconcileIntervalCycles: 8,
  strictPassiveOnly: true,
  allowBothSides: true,
  cancelOpenBuysOnExpiry: true,
  autoReentryEnabled: false,
}

export function vaultStrategyToConfig(strategy: Vault['strategy']): StrategyConfig {
  return {
    ...STRATEGY_CONFIG_DEFAULTS,
    // Field-name mapping (see findings #27): the engine keys on these names.
    entryPrice: strategy.bidPrice,
    exitPrice: strategy.sellPrice,
    orderSize: strategy.trancheSize,
    maxCapitalUsdc: strategy.maxCapital > 0 ? strategy.maxCapital : undefined,
    noNewEntriesLastSeconds: strategy.noNewEntriesLast,
    keepSellOrdersAfterExpirySeconds: strategy.keepSellAfter,
    // aiEnabled has no direct StrategyConfig counterpart; passive-only is the
    // closest semantic — when AI is off the vault stays strictly passive.
    strictPassiveOnly: !strategy.aiEnabled,
  }
}

export function configToVaultStrategy(config: StrategyConfig): Vault['strategy'] {
  return {
    bidPrice: config.entryPrice,
    sellPrice: config.exitPrice,
    maxCapital: config.maxCapitalUsdc ?? 0,
    trancheSize: config.orderSize,
    noNewEntriesLast: config.noNewEntriesLastSeconds,
    keepSellAfter: config.keepSellOrdersAfterExpirySeconds,
    aiEnabled: !config.strictPassiveOnly,
  }
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
    /**
     * @deprecated Vestige of the stripped Hedera integration. Always 0 for new
     * vaults (see app/vault/create/page.tsx). The agent-page HBAR gauge reads
     * this but no code ever funds it. Do not add new usages; the field will be
     * removed once the dependent UI is cleaned up.
     */
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
}

export const DEMO_VAULT: Vault = {
  id: 'demo-1',
  name: 'BTC Scalper Demo',
  created: Date.now() - 86400000 * 3,
  strategy: {
    bidPrice: 0.20,
    sellPrice: 0.25,
    maxCapital: 0,
    trancheSize: 10,
    noNewEntriesLast: 10,
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
