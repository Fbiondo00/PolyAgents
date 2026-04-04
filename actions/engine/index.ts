"use server"

// Server Actions: engine control endpoints
// These are callable from client components to start/stop/query engine state

import type { StrategyConfig } from "@/types/engine-schemas"
import type { CycleResult, ActiveMarketData } from "@/types/workflow"
import { getRun, saveRun, getMarketState, getCycleCount, addAuditEvent } from "@/actions/engine/store"
import { tradingCycleWorkflow } from "@/actions/engine/workflows/trading-cycle"
import { discoverMarket } from "@/actions/engine/steps/discover-market"
import { getTopOfBook } from "@/lib/engine/adapters/polymarket-readonly"
import { getClobAdapter } from "@/lib/engine/adapters/polymarket-clob"

// ── Result types ──

export interface EngineStatus {
  running: boolean
  state: string | null
  activeMarketId: string | null
  cycleCount: number
  lastHeartbeat: number | null
  lastError: string | null
}

export interface StartResult {
  success: boolean
  runId?: string
  error?: string
}

// ── Default config ──

const DEFAULT_CONFIG: StrategyConfig = {
  enabled: true,
  entryPrice: 0.01,
  exitPrice: 0.02,
  orderSize: 10,
  maxTradesPerMarket: 50,
  maxTradesPolicy: "side",
  noNewEntriesLastSeconds: 10,
  keepSellOrdersAfterExpirySeconds: 10,
  reconcileIntervalCycles: 8,
  strictPassiveOnly: true,
  allowBothSides: true,
  cancelOpenBuysOnExpiry: true,
  autoReentryEnabled: true,
}

// ── Actions ──

export async function startEngine(
  vaultId: string,
  config: StrategyConfig = DEFAULT_CONFIG,
): Promise<StartResult> {
  try {
    console.log(`[engine] startEngine called`, { vaultId })

    // Stop any existing run
    const existing = getRun(vaultId)
    if (existing) {
      saveRun(vaultId, { ...existing, status: "stopped", stoppedAt: Date.now(), currentState: "IDLE" })
    }

    // Create new run
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const run = {
      id: runId,
      vaultId,
      status: "running" as const,
      currentState: "DISCOVERING_MARKET" as const,
      activeMarketId: null,
      startedAt: Date.now(),
      stoppedAt: null,
      lastHeartbeatAt: Date.now(),
      lastError: null,
    }
    saveRun(vaultId, run)

    addAuditEvent(vaultId, {
      type: "ENGINE_STARTED",
      runId,
      timestamp: Date.now(),
    })

    // Start continuous workflow in background
    tradingCycleWorkflow(vaultId, config).catch(() => {})

    console.log(`[engine] engine started`, { runId })
    return { success: true, runId }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function stopEngine(vaultId: string): Promise<boolean> {
  console.log(`[engine] stopEngine called`, { vaultId })

  const run = getRun(vaultId)
  if (!run) return false

  saveRun(vaultId, {
    ...run,
    status: "stopped",
    stoppedAt: Date.now(),
    currentState: "IDLE",
  })

  addAuditEvent(vaultId, {
    type: "ENGINE_STOPPED",
    runId: run.id,
    timestamp: Date.now(),
  })

  return true
}

export async function getEngineStatus(vaultId: string): Promise<EngineStatus> {
  const run = getRun(vaultId)
  if (!run) {
    console.log(`[engine] getEngineStatus`, { vaultId, running: false, state: "IDLE" })
    return {
      running: false,
      state: "IDLE",
      activeMarketId: null,
      cycleCount: getCycleCount(vaultId),
      lastHeartbeat: null,
      lastError: null,
    }
  }

  console.log(`[engine] getEngineStatus`, { vaultId, running: run.status === "running", state: run.currentState })
  return {
    running: run.status === "running",
    state: run.currentState,
    activeMarketId: run.activeMarketId,
    cycleCount: getCycleCount(vaultId),
    lastHeartbeat: run.lastHeartbeatAt,
    lastError: run.lastError,
  }
}

export async function runSingleCycle(
  vaultId: string,
  config: StrategyConfig = DEFAULT_CONFIG,
): Promise<CycleResult> {
  console.log(`[engine] runSingleCycle called`, { vaultId })

  // Ensure a run exists
  let run = getRun(vaultId)
  if (!run) {
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    run = {
      id: runId,
      vaultId,
      status: "running",
      currentState: "DISCOVERING_MARKET",
      activeMarketId: null,
      startedAt: Date.now(),
      stoppedAt: null,
      lastHeartbeatAt: Date.now(),
      lastError: null,
    }
    saveRun(vaultId, run)
  }

  const result = await tradingCycleWorkflow(vaultId, config)

  // Auto-stop after single cycle (if not continuous mode)
  const currentRun = getRun(vaultId)
  if (currentRun) {
    saveRun(vaultId, { ...currentRun, lastHeartbeatAt: Date.now() })
  }

  console.log(`[engine] cycle complete`, { vaultId, status: result.status, fills: result.fills, pnl: result.pnl })
  return result
}

/**
 * Fetch active market data for immediate display on the agent page.
 * Returns market question, order books, time to expiry, and live/simulated status.
 */
export async function fetchActiveMarket(vaultId: string): Promise<ActiveMarketData | null> {
  try {
    console.log(`[engine] fetchActiveMarket called`, { vaultId })

    const { market } = await discoverMarket(vaultId)
    if (!market) {
      console.log(`[engine] fetchActiveMarket no market found`, { vaultId })
      return null
    }

    console.log(`[engine] fetchActiveMarket market found`, { vaultId, question: market.question, conditionId: market.conditionId })

    const adapter = getClobAdapter()
    const now = Math.floor(Date.now() / 1000)

    const [yesBook, noBook] = await Promise.all([
      getTopOfBook(market.yesTokenId),
      getTopOfBook(market.noTokenId),
    ])

    // Check if there's an Arc mirror for this market
    const state = getMarketState(vaultId)
    const arcMarketId = state?.market?.conditionId === market.conditionId
      ? undefined // TODO: get from state when implemented
      : undefined

    return {
      question: market.question,
      slug: market.slug,
      endTs: market.endTs,
      conditionId: market.conditionId,
      yesTokenId: market.yesTokenId,
      noTokenId: market.noTokenId,
      yesBook,
      noBook,
      isLive: adapter.isLive,
      arcMarketId,
      toExpiry: market.endTs - now,
    }
  } catch {
    return null
  }
}
