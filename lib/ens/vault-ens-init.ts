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

  console.log(`[ens:init] starting ENS initialization`, { vaultId, vaultName, mode })

  // 1. Create ENS subname
  console.log(`[ens:init] step 1/6: createVaultSubname`)
  const { ensName, createTxHash, resolverTxHash } =
    await createVaultSubname(vaultId)
  allTxHashes.push(createTxHash, resolverTxHash)
  console.log(`[ens:init] step 1/6: subname created`, { ensName, createTxHash, resolverTxHash })

  // 2. Compute and commit policy hash
  console.log(`[ens:init] step 2/6: commitPolicyHash`)
  const policyHash = computePolicyHash(strategy, vaultName, mode)
  const commitTx = await commitPolicyHash(ensName, policyHash)
  allTxHashes.push(commitTx)
  console.log(`[ens:init] step 2/6: policy committed`, { policyHash, commitTx })

  // 3. Write initial agent stats
  console.log(`[ens:init] step 3/6: updateAgentStats`)
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
  console.log(`[ens:init] step 3/6: stats written`, { txCount: statsTxes.length })

  // 4. Write vault metadata
  console.log(`[ens:init] step 4/6: writeVaultMetadata`)
  const metaTxes = await writeVaultMetadata(ensName, {
    description: `${vaultName} — autonomous AI vault on Polymarket`,
    strategyVersion: "1.0.0",
    createdAt: new Date().toISOString(),
    funding,
    network: "hedera-testnet",
  })
  allTxHashes.push(...metaTxes)
  console.log(`[ens:init] step 4/6: metadata written`, { txCount: metaTxes.length })

  // 5. ENSIP-25 agent verification (if Hedera is ready)
  if (hederaContext) {
    console.log(`[ens:init] step 5/6: registerAgentENSIP25`)
    const ensipTxes = await registerAgentENSIP25(ensName, hederaContext)
    allTxHashes.push(...ensipTxes)
    console.log(`[ens:init] step 5/6: ENSIP-25 registered`, { txCount: ensipTxes.length })
  } else {
    console.log(`[ens:init] step 5/6: skipped (no hedera context)`)
  }

  // 6. Add to fleet registry
  console.log(`[ens:init] step 6/6: registerAgentInFleet`)
  await registerAgentInFleet(vaultId, ensName, "trading-vault")
  console.log(`[ens:init] step 6/6: fleet registered`)

  console.log(`[ens:init] ENS initialization complete`, {
    ensName,
    policyHash,
    totalTxHashes: allTxHashes.length,
  })

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
