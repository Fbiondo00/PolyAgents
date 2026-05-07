import type { Tables, TablesInsert, TablesUpdate } from "@polyagents/schema"
import type { SupabaseClient as SBClient } from "./client"

type Client = SBClient

// ── Vaults ────────────────────────────────────────────────────────────────

export async function getVaults(client: Client, walletAddress?: string) {
  let q = client.from("vaults").select("*")
  if (walletAddress) q = q.eq("wallet_address", walletAddress)
  const { data, error } = await q
  if (error) throw error
  return data!
}

export async function getVaultById(client: Client, id: string) {
  const { data, error } = await client.from("vaults").select("*").eq("id", id).single()
  if (error) throw error
  return data!
}

export async function insertVault(client: Client, vault: TablesInsert<"vaults">) {
  const { data, error } = await client.from("vaults").insert(vault).select("*").single()
  if (error) throw error
  return data!
}

export async function updateVault(client: Client, id: string, patch: TablesUpdate<"vaults">) {
  const { data, error } = await client.from("vaults").update(patch).eq("id", id).select("*").single()
  if (error) throw error
  return data!
}

export async function deleteVault(client: Client, id: string) {
  const { error } = await client.from("vaults").delete().eq("id", id)
  if (error) throw error
}

// ── Engine Runs ───────────────────────────────────────────────────────────

export async function getEngineRun(client: Client, vaultId: string) {
  const { data, error } = await client
    .from("engine_runs")
    .select("*")
    .eq("vault_id", vaultId)
    .eq("status", "running")
    .single()
  if (error && error.code !== "PGRST116") throw error
  return data
}

export async function getAllRunningRuns(client: Client) {
  const { data, error } = await client.from("engine_runs").select("*").eq("status", "running")
  if (error) throw error
  return data!
}

export async function insertEngineRun(client: Client, run: TablesInsert<"engine_runs">) {
  const { data, error } = await client.from("engine_runs").insert(run).select("*").single()
  if (error) throw error
  return data!
}

export async function updateEngineRun(client: Client, vaultId: string, patch: TablesUpdate<"engine_runs">) {
  const { data, error } = await client
    .from("engine_runs")
    .update(patch)
    .eq("vault_id", vaultId)
    .neq("status", "stopped")
    .neq("status", "error")
    .select("*")
    .single()
  if (error && error.code !== "PGRST116") throw error
  return data
}

// ── Virtual Orders ────────────────────────────────────────────────────────

export async function getOrder(client: Client, orderId: string) {
  const { data, error } = await client.from("virtual_orders").select("*").eq("id", orderId).single()
  if (error && error.code !== "PGRST116") throw error
  return data
}

export async function getOrdersForRun(client: Client, runId: string) {
  const { data, error } = await client.from("virtual_orders").select("*").eq("engine_run_id", runId)
  if (error) throw error
  return data!
}

export async function insertOrder(client: Client, order: TablesInsert<"virtual_orders">) {
  const { data, error } = await client.from("virtual_orders").insert(order).select("*").single()
  if (error) throw error
  return data!
}

export async function updateOrder(client: Client, orderId: string, patch: TablesUpdate<"virtual_orders">) {
  const { error } = await client.from("virtual_orders").update(patch).eq("id", orderId)
  if (error) throw error
}

export async function getOpenOrdersForSide(
  client: Client,
  runId: string,
  side: string,
  intent: string
) {
  const { data, error } = await client
    .from("virtual_orders")
    .select("*")
    .eq("engine_run_id", runId)
    .eq("side", side)
    .eq("intent", intent)
    .in("status", ["OPEN", "PARTIAL"])
  if (error) throw error
  return data!
}

export async function getOpenOrdersForMarket(
  client: Client,
  runId: string,
  marketId: string,
  intent: string
) {
  const { data, error } = await client
    .from("virtual_orders")
    .select("*")
    .eq("engine_run_id", runId)
    .eq("market_id", marketId)
    .eq("intent", intent)
    .in("status", ["OPEN", "PARTIAL"])
  if (error) throw error
  return data!
}

// ── Market States ─────────────────────────────────────────────────────────

export async function getMarketState(client: Client, vaultId: string) {
  const { data, error } = await client.from("market_states").select("*").eq("vault_id", vaultId).single()
  if (error && error.code !== "PGRST116") throw error
  return data
}

export async function upsertMarketState(client: Client, state: TablesInsert<"market_states">) {
  const { data, error } = await client
    .from("market_states")
    .upsert(state, { onConflict: "vault_id" })
    .select("*")
    .single()
  if (error) throw error
  return data!
}

// ── Strategy Configs ──────────────────────────────────────────────────────

export async function getStrategyConfig(client: Client, vaultId: string) {
  const { data, error } = await client.from("strategy_configs").select("*").eq("vault_id", vaultId).single()
  if (error && error.code !== "PGRST116") throw error
  return data
}

export async function upsertStrategyConfig(client: Client, config: TablesInsert<"strategy_configs">) {
  const { data, error } = await client
    .from("strategy_configs")
    .upsert(config, { onConflict: "vault_id" })
    .select("*")
    .single()
  if (error) throw error
  return data!
}

// ── PnL Snapshots ─────────────────────────────────────────────────────────

export async function insertPnlSnapshot(client: Client, snapshot: TablesInsert<"pnl_snapshots">) {
  const { data, error } = await client.from("pnl_snapshots").insert(snapshot).select("*").single()
  if (error) throw error
  return data!
}

export async function getPnlSnapshots(client: Client, vaultId: string, limit = 50) {
  const { data, error } = await client
    .from("pnl_snapshots")
    .select("*")
    .eq("vault_id", vaultId)
    .order("computed_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return data!
}

// ── Audit Events ──────────────────────────────────────────────────────────

export async function insertAuditEvent(client: Client, event: TablesInsert<"audit_events">) {
  const { data, error } = await client.from("audit_events").insert(event).select("*").single()
  if (error) throw error
  return data!
}

export async function getAuditEvents(client: Client, vaultId: string, limit = 100) {
  const { data, error } = await client
    .from("audit_events")
    .select("*")
    .eq("vault_id", vaultId)
    .order("timestamp", { ascending: false })
    .limit(limit)
  if (error) throw error
  return data!
}

// ── Cached Books ──────────────────────────────────────────────────────────

export async function getCachedBooks(client: Client, vaultId: string) {
  const { data, error } = await client.from("cached_books").select("*").eq("vault_id", vaultId).single()
  if (error && error.code !== "PGRST116") throw error
  return data
}

export async function upsertCachedBooks(client: Client, books: TablesInsert<"cached_books">) {
  const { data, error } = await client
    .from("cached_books")
    .upsert(books, { onConflict: "vault_id" })
    .select("*")
    .single()
  if (error) throw error
  return data!
}
