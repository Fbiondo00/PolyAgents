'use client'

import { Vault, AuditEvent, DEMO_VAULT } from '@/types'

const VAULTS_KEY = 'polyagents.vaults'
const SELECTED_KEY = 'polyagents.selectedVaultId'
const DEMO_CREATED_KEY = 'polyagents.demoVaultCreated'

function isClient() {
  return typeof window !== 'undefined'
}

export function getVaults(): Vault[] {
  if (!isClient()) return []
  try {
    const raw = localStorage.getItem(VAULTS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveVaults(vaults: Vault[]): void {
  if (!isClient()) return
  localStorage.setItem(VAULTS_KEY, JSON.stringify(vaults))
}

export function getSelectedVaultId(): string | null {
  if (!isClient()) return null
  return localStorage.getItem(SELECTED_KEY)
}

export function setSelectedVaultId(id: string): void {
  if (!isClient()) return
  localStorage.setItem(SELECTED_KEY, id)
}

export function getVaultById(id: string): Vault | null {
  return getVaults().find(v => v.id === id) ?? null
}

export function saveVault(vault: Vault): void {
  const vaults = getVaults()
  const idx = vaults.findIndex(v => v.id === vault.id)
  if (idx >= 0) {
    vaults[idx] = vault
  } else {
    vaults.push(vault)
  }
  saveVaults(vaults)
}

export function deleteVault(id: string): void {
  const vaults = getVaults().filter(v => v.id !== id)
  saveVaults(vaults)
}

export function addAuditEvent(vaultId: string, event: AuditEvent): void {
  const vault = getVaultById(vaultId)
  if (!vault) return
  vault.audit = [event, ...vault.audit].slice(0, 200)
  saveVault(vault)
}

export function initDemoVault(): Vault {
  if (!isClient()) return DEMO_VAULT
  const demoCreated = localStorage.getItem(DEMO_CREATED_KEY)
  if (!demoCreated) {
    const demo: Vault = {
      ...DEMO_VAULT,
      created: Date.now(),
      activeMarket: {
        id: 'btc-5m-42',
        expiry: Date.now() + 167000,
        midPrice: 0.523,
      },
    }
    saveVault(demo)
    localStorage.setItem(DEMO_CREATED_KEY, 'true')
    return demo
  }
  return getVaultById('demo-1') ?? DEMO_VAULT
}

export function generateId(): string {
  return `vault-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function generateAuditId(): string {
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function updateVaultStats(vaultId: string, deltaPnl: number): void {
  const vault = getVaultById(vaultId)
  if (!vault) return
  vault.stats.cycles += 1
  vault.stats.pnl = Math.round((vault.stats.pnl + deltaPnl) * 100) / 100
  if (deltaPnl !== 0) vault.stats.flips += 1
  vault.sparkline = [...(vault.sparkline ?? []).slice(-9), vault.stats.pnl]
  saveVault(vault)
}
