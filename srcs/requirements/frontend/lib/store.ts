'use client'

import { Vault, AuditEvent, DEMO_VAULT } from '@/types'
import { supabase } from './supabase'
import { supabaseQueries as q } from '@polyagents/sdk'
import type { Tables } from '@polyagents/sdk'
import {
  dbToVault,
  vaultToDb,
  vaultPatchToDb,
  auditEventToDb,
  dbToAuditEvent,
} from './db-mappers'

export async function getVaults(): Promise<Vault[]> {
  const rows = await q.getVaults(supabase)
  return rows.map((row: Tables<"vaults">) => {
    const vault = dbToVault(row)
    return { ...vault, audit: [] } as Vault
  })
}

export async function getVaultById(id: string): Promise<Vault | null> {
  try {
    const row = await q.getVaultById(supabase, id)
    const auditRows = await q.getAuditEvents(supabase, id, 200)
    const vault = dbToVault(row)
    return { ...vault, audit: auditRows.map(dbToAuditEvent) } as Vault
  } catch {
    return null
  }
}

export async function saveVault(vault: Vault): Promise<void> {
  try {
    const existing = await q.getVaultById(supabase, vault.id)
    if (existing) {
      await q.updateVault(supabase, vault.id, vaultPatchToDb(vault))
    } else {
      await q.insertVault(supabase, vaultToDb(vault))
    }
  } catch {
    // Insert on conflict (vault may already exist from another session)
    await q.insertVault(supabase, vaultToDb(vault))
  }
}

export async function deleteVault(id: string): Promise<void> {
  await q.deleteVault(supabase, id)
}

export async function addAuditEvent(vaultId: string, event: AuditEvent): Promise<void> {
  await q.insertAuditEvent(supabase, auditEventToDb(vaultId, event))
}

export async function initDemoVault(): Promise<Vault> {
  const existing = await getVaultById('demo-1')
  if (existing) return existing

  const demo: Vault = {
    ...DEMO_VAULT,
    created: Date.now(),
    activeMarket: {
      id: 'btc-5m-42',
      expiry: Date.now() + 167000,
      midPrice: 0.523,
    },
  }
  await saveVault(demo)

  // Seed demo audit events
  for (const evt of demo.audit) {
    await q.insertAuditEvent(supabase, auditEventToDb(demo.id, evt))
  }

  return demo
}

export function generateId(): string {
  return `vault-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function generateAuditId(): string {
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export async function updateVaultStats(vaultId: string, deltaPnl: number): Promise<void> {
  const vault = await getVaultById(vaultId)
  if (!vault) return
  vault.stats.cycles += 1
  vault.stats.pnl = Math.round((vault.stats.pnl + deltaPnl) * 100) / 100
  if (deltaPnl !== 0) vault.stats.flips += 1
  vault.sparkline = [...(vault.sparkline ?? []).slice(-9), vault.stats.pnl]
  await saveVault(vault)
}
