import type { Vault, AuditEvent } from '@/types/vault'
import type { AuditRecord, Books, EngineRun, MarketState, PnlSnapshot, VirtualOrder } from '@/types/engine'
import type { StrategyConfig } from '@/types/engine-schemas'
import {
  type VaultRow,
  type AuditEventRow,
  type EngineRunRow,
  type VirtualOrderRow,
  type MarketStateRow,
  type PnlSnapshotRow,
  type StrategyConfigRow,
  type CachedBooksRow,
  rowToVault,
  vaultToRow,
  rowToAuditEvent,
  rowToEngineRun,
  rowToVirtualOrder,
  rowToMarketState,
  rowToPnlSnapshot,
  rowToStrategyConfig,
  strategyConfigToRow,
  rowToBooks,
} from '@/types/database'

const API = process.env.NEXT_PUBLIC_ENGINE_URL ?? 'http://localhost:8080'

// The engine gates state/money-mutating routes behind a bearer token
// (ENGINE_API_TOKEN). This client module is imported by 'use client' components
// and so runs in the browser — therefore the token must be a NEXT_PUBLIC_ var to
// be available client-side. Exposure trade-off: this is a single-operator admin
// token for a trading vault that binds to loopback/Tailscale, so browser
// visibility is acceptable (the engine still rejects any caller without it).
// The engine URL is already public by the same reasoning. For a multi-user
// deploy, route browser writes through a server action that injects a
// server-only token instead.
const API_TOKEN = process.env.NEXT_PUBLIC_ENGINE_API_TOKEN ?? ''

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (API_TOKEN) headers['Authorization'] = `Bearer ${API_TOKEN}`
  const res = await fetch(`${API}${path}`, {
    headers,
    ...init,
  })
  if (!res.ok) {
    throw new Error(`Engine API ${res.status}: ${res.statusText} (${path})`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

async function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path)
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined })
}

async function apiPut<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) })
}

async function apiDelete(path: string): Promise<void> {
  await apiFetch<void>(path, { method: 'DELETE' })
}

export const engine = {
  // ── Vaults ──

  async listVaults(): Promise<Vault[]> {
    const { vaults } = await apiGet<{ vaults: VaultRow[] }>('/vaults')
    return vaults.map((r) => ({ ...rowToVault(r), audit: [] }))
  },

  async getVault(id: string): Promise<Vault | null> {
    try {
      const { vault } = await apiGet<{ vault: VaultRow }>(`/vaults/${id}`)
      return { ...rowToVault(vault), audit: [] }
    } catch {
      return null
    }
  },

  async createVault(vault: Vault): Promise<{ vault: Vault; agent_address?: string }> {
    const { vault: created, agent_address } = await apiPost<{ vault: VaultRow; agent_address?: string }>('/vaults', vaultToRow(vault))
    return { vault: { ...rowToVault(created), audit: [] }, agent_address }
  },

  async updateVault(id: string, vault: Vault): Promise<void> {
    await apiPut(`/vaults/${id}`, vaultToRow(vault))
  },

  async deleteVault(id: string): Promise<void> {
    await apiDelete(`/vaults/${id}`)
  },

  // ── Audit ──

  async getAuditEvents(vaultId: string): Promise<AuditEvent[]> {
    const { events } = await apiGet<{ events: AuditEventRow[] }>(`/audit/${vaultId}`)
    return events.map(rowToAuditEvent)
  },

  async getEngineAuditRecords(vaultId: string): Promise<AuditRecord[]> {
    const { events } = await apiGet<{ events: AuditEventRow[] }>(`/audit/${vaultId}`)
    return events.map((row) => {
      const data = row.data ?? {}
      return { type: row.event_type, timestamp: row.timestamp, ...data } as AuditRecord
    })
  },

  // ── Engine Control ──

  async startEngine(vaultId: string): Promise<{ runId: string; status: string }> {
    return apiPost(`/engine/${vaultId}/start`)
  },

  async stopEngine(vaultId: string): Promise<{ status: string }> {
    return apiPost(`/engine/${vaultId}/stop`)
  },

  async engineStatus(vaultId: string): Promise<{ vault_id: string; status: string; state: string }> {
    return apiGet(`/engine/${vaultId}/status`)
  },

  async cancelOrders(vaultId: string): Promise<{ cancelled: number; status: string }> {
    return apiPost(`/engine/${vaultId}/cancel-orders`)
  },

  async activeEngines(): Promise<{ engines: Array<{ vault_id: string; state: string }> }> {
    return apiGet('/engine/active')
  },

  // ── Engine Run ──

  async getEngineRun(vaultId: string): Promise<EngineRun | null> {
    const { run } = await apiGet<{ run: EngineRunRow | null }>(`/engine-runs/${vaultId}`)
    return run ? rowToEngineRun(run) : null
  },

  // ── Strategy Config ──

  async getConfig(vaultId: string): Promise<StrategyConfig> {
    const { config } = await apiGet<{ config: StrategyConfigRow }>(`/vaults/${vaultId}/config`)
    return rowToStrategyConfig(config)
  },

  async updateConfig(vaultId: string, config: StrategyConfig): Promise<void> {
    await apiPut(`/vaults/${vaultId}/config`, strategyConfigToRow(vaultId, config))
  },

  // ── Orders ──

  async getOrders(vaultId: string): Promise<VirtualOrder[]> {
    const { orders } = await apiGet<{ orders: VirtualOrderRow[] }>(`/orders/${vaultId}`)
    return orders.map(rowToVirtualOrder)
  },

  // ── PnL ──

  async getPnl(vaultId: string): Promise<PnlSnapshot[]> {
    const { snapshots } = await apiGet<{ snapshots: PnlSnapshotRow[] }>(`/pnl/${vaultId}`)
    return snapshots.map(rowToPnlSnapshot)
  },

  // ── Market State ──

  async getMarketState(vaultId: string): Promise<MarketState | null> {
    const { market_state } = await apiGet<{ market_state: MarketStateRow | null }>(`/market-state/${vaultId}`)
    return market_state ? rowToMarketState(market_state) : null
  },

  // ── Books ──

  async getBooks(vaultId: string): Promise<Books> {
    const { books } = await apiGet<{ books: CachedBooksRow | null }>(`/books/${vaultId}`)
    return books ? rowToBooks(books) : {}
  },

  // ── Agent / Funding ──

  async getAgentAddress(vaultId: string): Promise<string> {
    const { agent_address } = await apiGet<{ vault_id: string; agent_address: string }>(`/vaults/${vaultId}/agent-address`)
    return agent_address
  },

  async getOnChainBalance(vaultId: string): Promise<{ address: string; balance: string }> {
    const { agent_address, usdc_balance } = await apiGet<{ vault_id: string; agent_address: string; usdc_balance: string }>(`/vaults/${vaultId}/balance`)
    return { address: agent_address, balance: usdc_balance }
  },

  async requestWithdrawal(vaultId: string, recipient: string, amount: string): Promise<{ tx_hash: string }> {
    const { tx_hash } = await apiPost<{ vault_id: string; tx_hash: string; recipient: string; amount: string }>(`/vaults/${vaultId}/withdraw`, { recipient, amount })
    return { tx_hash }
  },
}
