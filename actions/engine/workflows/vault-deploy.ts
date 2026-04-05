"use workflow"

// Vault deployment workflow
// Steps: Hedera init → ENS init → Arc agent authorization → initial market creation

import type { DeployProgress } from "@/types/workflow"
import { addAuditEvent } from "@/actions/engine/store"

export async function vaultDeployWorkflow(
  vaultId: string,
  opts: {
    vaultName: string
    hederaEnabled: boolean
    ensEnabled: boolean
    arcEnabled: boolean
  },
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = []

  function progress(stage: string) {
    const event: DeployProgress = {
      stage,
      vaultId,
      timestamp: Date.now(),
    }
    addAuditEvent(vaultId, { ...event, type: "DEPLOY_PROGRESS" })
  }

  try {
    // Step 1: Hedera initialization
    if (opts.hederaEnabled) {
      progress("hedera-init")
      try {
        const { initVault } = await import("@/actions/hedera")
        await initVault({ vaultId, vaultName: opts.vaultName })
      } catch (err) {
        errors.push(`Hedera init failed: ${err}`)
      }
    }

    // Step 2: ENS initialization
    if (opts.ensEnabled) {
      progress("ens-init")
      try {
        const { initVaultENS } = await import("@/lib/ens/vault-ens-init")
        await initVaultENS({
          vaultId,
          vaultName: opts.vaultName,
          strategy: {
            bidPrice: 0.01,
            sellPrice: 0.02,
            maxCapital: 100,
            trancheSize: 10,
            noNewEntriesLast: 10,
            keepSellAfter: 10,
            aiEnabled: true,
          },
          mode: "advisory",
          funding: { usdc: 0, hbar: 0 },
        })
      } catch (err) {
        errors.push(`ENS init failed: ${err}`)
      }
    }

    // Step 3: Arc agent authorization
    if (opts.arcEnabled) {
      progress("arc-auth")
      try {
        const { approveUsdc } = await import("@/lib/arc/market-client")
        // Agent approves USDC spending on the Arc market contract
        // (actual wallet client setup depends on auth context)
      } catch (err) {
        errors.push(`Arc auth failed: ${err}`)
      }
    }

    // Step 4: Create initial market (optional)
    if (opts.arcEnabled) {
      progress("market-create")
      try {
        const { createMarket } = await import("@/lib/arc/market-client")
        // Market creation depends on wallet context — placeholder
      } catch (err) {
        errors.push(`Market creation failed: ${err}`)
      }
    }

    progress("complete")
    return { success: errors.length === 0, errors }
  } catch (err) {
    progress("error")
    return { success: false, errors: [...errors, String(err)] }
  }
}
