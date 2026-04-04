"use server"

import type { Hex } from "viem"
import { computePolicyHash, commitPolicyHash, verifyPolicyIntegrity } from "@/lib/ens/policy-commitment"
import { readAgentStats } from "@/lib/ens/agent-stats"
import { resolveAgentProfile } from "@/lib/ens/agent-identity"
import { buildEnsName } from "@/lib/ens/subname"
import type { Vault } from "@/types"

// ── Result Types ──

export interface PolicyCommitResult {
  success: boolean
  txHash?: string
  error?: string
}

export interface PolicyVerifyResult {
  success: boolean
  match?: boolean
  localHash?: string
  onChainHash?: string | null
  error?: string
}

export interface AgentStatsResult {
  success: boolean
  stats?: Record<string, string>
  error?: string
}

export interface AgentProfileResult {
  success: boolean
  profile?: Record<string, string>
  error?: string
}

// ── Actions ──

/**
 * Commit a policy hash to ENS text record.
 * Called from the Policy page when the user saves strategy changes.
 */
export async function commitPolicy(
  vaultId: string,
  strategy: Vault["strategy"],
  vaultName: string,
  mode: Vault["mode"],
): Promise<PolicyCommitResult> {
  try {
    const ensName = buildEnsName(vaultId)
    const policyHash = computePolicyHash(strategy, vaultName, mode)
    const txHash = await commitPolicyHash(ensName, policyHash)
    return { success: true, txHash }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return { success: false, error: message }
  }
}

/**
 * Verify policy integrity by comparing local hash with on-chain value.
 */
export async function verifyPolicy(
  vaultId: string,
  strategy: Vault["strategy"],
  vaultName: string,
  mode: Vault["mode"],
): Promise<PolicyVerifyResult> {
  try {
    const ensName = buildEnsName(vaultId)
    const result = await verifyPolicyIntegrity(ensName, strategy, vaultName, mode)
    return {
      success: true,
      match: result.match,
      localHash: result.localHash,
      onChainHash: result.onChainHash,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return { success: false, error: message }
  }
}

/**
 * Read live agent stats from ENS text records.
 */
export async function fetchAgentStats(vaultId: string): Promise<AgentStatsResult> {
  try {
    const ensName = buildEnsName(vaultId)
    const stats = await readAgentStats(ensName)
    return { success: true, stats }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return { success: false, error: message }
  }
}

/**
 * Resolve agent profile (ENSIP-25) from ENS text records.
 */
export async function fetchAgentProfile(vaultId: string): Promise<AgentProfileResult> {
  try {
    const ensName = buildEnsName(vaultId)
    const profile = await resolveAgentProfile(ensName)
    return { success: true, profile }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return { success: false, error: message }
  }
}
