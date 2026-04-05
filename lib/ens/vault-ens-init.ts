import { createVaultSubname } from "./subname"
import {
  computePolicyHash,
  commitPolicyHash,
} from "./policy-commitment"
import { updateAgentStats } from "./agent-stats"
import { writeVaultMetadata } from "./vault-metadata"
import { registerAgentENSIP25 } from "./agent-identity"
import { registerAgentInFleet } from "./fleet-registry"
import type { Vault } from "@/types/vault"
import type { HederaContext } from "@/types/hedera"

export interface ENSInitResult {
  ensName: string
  policyHash: string
  txHashes: string[]
}

/**
 * Full ENS initialization for a new vault.
 * Called after Hedera vault-init in the deploy step.
 *
 * Steps:
 * 1. Create ENS subname (agent identity)
 * 2. Compute and commit policy hash (Most Creative bounty)
 * 3. Write initial agent stats (Most Creative bounty)
 * 4. Write vault metadata
 * 5. Register ENSIP-25 agent verification (AI Agents bounty)
 * 6. Add to fleet registry (AI Agents bounty)
 */
export async function initVaultENS(opts: {
  vaultId: string
  vaultName: string
  strategy: Vault["strategy"]
  mode: Vault["mode"]
  funding: { usdc: number; hbar: number }
  hederaContext?: HederaContext
}): Promise<ENSInitResult> {
  const { vaultId, vaultName, strategy, mode, funding, hederaContext } = opts
  const allTxHashes: string[] = []

  // 1. Create ENS subname
  const { ensName, createTxHash, resolverTxHash } =
    await createVaultSubname(vaultId)
  allTxHashes.push(createTxHash, resolverTxHash)

  // 2. Compute and commit policy hash
  const policyHash = computePolicyHash(strategy, vaultName, mode)
  const commitTx = await commitPolicyHash(ensName, policyHash)
  allTxHashes.push(commitTx)

  // 3. Write initial agent stats
  const statsTxes = await updateAgentStats(ensName, {
    flips: 0,
    pnl: 0,
    inventoryUp: 0,
    inventoryDown: 0,
    mode,
    cycles: 0,
    lastTrade: new Date().toISOString(),
    engineState: "IDLE",
  })
  allTxHashes.push(...statsTxes)

  // 4. Write vault metadata
  const metaTxes = await writeVaultMetadata(ensName, {
    description: `${vaultName} — autonomous AI vault on Polymarket`,
    strategyVersion: "1.0.0",
    createdAt: new Date().toISOString(),
    funding,
    network: "hedera-testnet",
  })
  allTxHashes.push(...metaTxes)

  // 5. ENSIP-25 agent verification (if Hedera is ready)
  if (hederaContext) {
    const ensipTxes = await registerAgentENSIP25(ensName, hederaContext)
    allTxHashes.push(...ensipTxes)
  }

  // 6. Add to fleet registry
  await registerAgentInFleet(vaultId, ensName, "trading-vault")

  return { ensName, policyHash, txHashes: allTxHashes }
}

/**
 * Build the ENS context object to persist on the Vault.
 */
export function buildEnsContext(result: ENSInitResult): Vault["ens"] {
  return {
    name: result.ensName,
    policyHash: result.policyHash,
    txHashes: result.txHashes,
    initializedAt: Date.now(),
  }
}
