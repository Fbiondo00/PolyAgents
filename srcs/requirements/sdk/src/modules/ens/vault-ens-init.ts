import { createVaultSubname } from "./subname"
import { computePolicyHash, commitPolicyHash } from "./policy-commitment"
import { updateAgentStats } from "./agent-stats"
import { writeVaultMetadata } from "./vault-metadata"
import { registerAgentENSIP25 } from "./agent-identity"
import { registerAgentInFleet } from "./fleet-registry"
import type { Vault, HederaContext } from "@polyagents/schema"

export interface ENSInitResult { ensName: string; policyHash: string; txHashes: string[] }

export async function initVaultENS(opts: {
  vaultId: string; vaultName: string; strategy: Vault["strategy"]
  mode: Vault["mode"]; funding: { usdc: number; hbar: number }; hederaContext?: HederaContext
}): Promise<ENSInitResult> {
  const { vaultId, vaultName, strategy, mode, funding, hederaContext } = opts
  const allTxHashes: string[] = []

  const { ensName, createTxHash, resolverTxHash } = await createVaultSubname(vaultId)
  allTxHashes.push(createTxHash, resolverTxHash)

  const policyHash = computePolicyHash(strategy, vaultName, mode)
  const commitTx = await commitPolicyHash(ensName, policyHash)
  allTxHashes.push(commitTx)

  const statsTxes = await updateAgentStats(ensName, { flips: 0, pnl: 0, inventoryUp: 0, inventoryDown: 0, mode, cycles: 0, lastTrade: new Date().toISOString(), engineState: "IDLE" })
  allTxHashes.push(...statsTxes)

  const metaTxes = await writeVaultMetadata(ensName, { description: `${vaultName} — autonomous AI vault on Polymarket`, strategyVersion: "1.0.0", createdAt: new Date().toISOString(), funding, network: "hedera-testnet" })
  allTxHashes.push(...metaTxes)

  if (hederaContext) {
    const ensipTxes = await registerAgentENSIP25(ensName, hederaContext)
    allTxHashes.push(...ensipTxes)
  }

  await registerAgentInFleet(vaultId, ensName, "trading-vault")

  return { ensName, policyHash, txHashes: allTxHashes }
}

export function buildEnsContext(result: ENSInitResult): Vault["ens"] {
  return { name: result.ensName, policyHash: result.policyHash, txHashes: result.txHashes, initializedAt: Date.now() }
}
