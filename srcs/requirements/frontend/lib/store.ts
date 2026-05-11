'use client'

import { Vault, AuditEvent, DEMO_VAULT } from '@/types'
import { engine } from './engine-api'

export async function getVaults(): Promise<Vault[]> {
  const vaults = await engine.listVaults()
  return vaults.map((v) => ({ ...v, audit: [] }) as Vault)
}

export async function getVaultById(id: string): Promise<Vault | null> {
  try {
    const vault = await engine.getVault(id)
    if (!vault) return null
    const audit = await engine.getAuditEvents(id)
    return { ...vault, audit } as Vault
  } catch {
    return null
  }
}

export async function saveVault(vault: Vault): Promise<void> {
  const existing = await engine.getVault(vault.id)
  if (existing) {
    await engine.updateVault(vault.id, vault)
  } else {
    await engine.createVault(vault)
  }
}

export async function deleteVault(id: string): Promise<void> {
  await engine.deleteVault(id)
}

export async function addAuditEvent(_vaultId: string, _event: AuditEvent): Promise<void> {
  // Audit events are written by the Rust engine — client-side stub
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
