import { batchSetTextRecords } from "./subname"

export interface VaultMetadata { description: string; strategyVersion: string; createdAt: string; funding: { usdc: number; hbar: number }; network: string }

export async function writeVaultMetadata(ensName: string, meta: VaultMetadata): Promise<string[]> {
  const records: [string, string][] = [
    ["vault.description", meta.description], ["vault.strategy-version", meta.strategyVersion],
    ["vault.created-at", meta.createdAt], ["vault.funding-usdc", meta.funding.usdc.toString()],
    ["vault.funding-hbar", meta.funding.hbar.toString()], ["vault.network", meta.network],
    ["name", "PolyAgents Vault"], ["description", meta.description],
  ]
  return batchSetTextRecords(ensName, records)
}
