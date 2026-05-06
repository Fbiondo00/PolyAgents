const registry = new Map<string, { tokenId: string; treasuryAccountId: string }>()

export function registerVault(
  vaultId: string,
  context: { tokenId: string; treasuryAccountId: string },
): void {
  registry.set(vaultId, context)
}

export function getVaultHederaContext(
  vaultId: string,
): { tokenId: string; treasuryAccountId: string } | null {
  return registry.get(vaultId) ?? null
}
