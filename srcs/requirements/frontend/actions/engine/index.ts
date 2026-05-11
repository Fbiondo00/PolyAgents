"use server"

// Server Actions: engine control endpoints
// Delegates to the Rust engine HTTP API at localhost:8080

import type { ActiveMarketData } from "@/types/workflow"
import { engine } from "@/lib/engine-api"

const API = process.env.NEXT_PUBLIC_ENGINE_URL ?? "http://localhost:8080"

async function apiPost<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method: "POST", headers: { "Content-Type": "application/json" } })
  if (!res.ok) throw new Error(`Engine API ${res.status}: ${res.statusText}`)
  return res.json()
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { "Content-Type": "application/json" } })
  if (!res.ok) throw new Error(`Engine API ${res.status}: ${res.statusText}`)
  return res.json()
}

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

// ── Actions ──

export async function startEngine(vaultId: string): Promise<StartResult> {
  try {
    const result = await apiPost<{ run_id: string; status: string }>(`/engine/${vaultId}/start`)
    return { success: true, runId: result.run_id }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function stopEngine(vaultId: string): Promise<boolean> {
  try {
    await apiPost(`/engine/${vaultId}/stop`)
    return true
  } catch {
    return false
  }
}

export async function getEngineStatus(vaultId: string): Promise<EngineStatus> {
  try {
    const status = await apiGet<{ vault_id: string; status: string; state: string }>(`/engine/${vaultId}/status`)
    return {
      running: status.status === "running",
      state: status.state,
      activeMarketId: null,
      cycleCount: 0,
      lastHeartbeat: null,
      lastError: null,
    }
  } catch {
    return {
      running: false,
      state: "IDLE",
      activeMarketId: null,
      cycleCount: 0,
      lastHeartbeat: null,
      lastError: null,
    }
  }
}

export async function runSingleCycle(
  _vaultId: string,
): Promise<{ success: boolean; fills: number; pnl: number; error?: string }> {
  // The Rust engine runs cycles internally — single cycle is a no-op here
  return { success: true, fills: 0, pnl: 0 }
}

export async function fetchActiveMarket(vaultId: string): Promise<ActiveMarketData | null> {
  try {
    const { market_state } = await apiGet<{ market_state: unknown }>(`/market-state/${vaultId}`)
    if (!market_state || typeof market_state !== "object" || !("market" in market_state)) return null

    const market = (market_state as Record<string, unknown>).market as Record<string, unknown> | null
    if (!market) return null

    return {
      question: market.question as string ?? "",
      slug: market.slug as string ?? "",
      endTs: (market.end_date as number) ?? 0,
      conditionId: market.condition_id as string ?? "",
      yesTokenId: "",
      noTokenId: "",
      yesBook: { bestBid: null, bestAsk: null },
      noBook: { bestBid: null, bestAsk: null },
      isLive: false,
      toExpiry: 0,
    }
  } catch {
    return null
  }
}
