import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const REGISTRY_PATH = join(process.cwd(), '.vault-registry.json')

interface VaultRegistryEntry {
  tokenId: string
  treasuryAccountId: string
}

type Registry = Record<string, VaultRegistryEntry>

function readRegistry(): Registry {
  try {
    const raw = readFileSync(REGISTRY_PATH, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function writeRegistry(data: Registry): void {
  writeFileSync(REGISTRY_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function registerVault(
  vaultId: string,
  context: { tokenId: string; treasuryAccountId: string },
): void {
  const registry = readRegistry()
  registry[vaultId] = {
    tokenId: context.tokenId,
    treasuryAccountId: context.treasuryAccountId,
  }
  writeRegistry(registry)
}

export function getVaultHederaContext(
  vaultId: string,
): { tokenId: string; treasuryAccountId: string } | null {
  const registry = readRegistry()
  return registry[vaultId] ?? null
}
