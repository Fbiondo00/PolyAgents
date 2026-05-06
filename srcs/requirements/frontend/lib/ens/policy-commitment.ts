import { keccak256, toBytes, type Hex } from "viem"
import { setTextRecord, readTextRecord } from "./subname"
import type { Vault } from "@/types/vault"

/**
 * Compute keccak256 hash of the vault strategy + name + mode.
 * This is the commitment: the hash is public, the policy content is private.
 * Anyone can verify the agent follows the original policy by recomputing
 * the hash from the current strategy and comparing it to the on-chain value.
 */
export function computePolicyHash(
  strategy: Vault["strategy"],
  vaultName: string,
  mode: Vault["mode"]
): Hex {
  // Deterministic serialization — key order matters for consistent hashing
  const serialized = JSON.stringify({
    n: vaultName,
    m: mode,
    s: {
      bp: strategy.bidPrice,
      sp: strategy.sellPrice,
      mc: strategy.maxCapital,
      ts: strategy.trancheSize,
      ne: strategy.noNewEntriesLast,
      ks: strategy.keepSellAfter,
      ai: strategy.aiEnabled,
    },
  })
  return keccak256(toBytes(serialized))
}

/**
 * Write the policy hash as ENS text record "policy.commitment".
 */
export async function commitPolicyHash(
  ensName: string,
  policyHash: Hex
): Promise<string> {
  return setTextRecord(ensName, "policy.commitment", policyHash)
}

export interface PolicyVerificationResult {
  match: boolean
  localHash: Hex
  onChainHash: string | null
}

/**
 * Verify policy integrity: recompute local hash and compare with on-chain.
 */
export async function verifyPolicyIntegrity(
  ensName: string,
  strategy: Vault["strategy"],
  vaultName: string,
  mode: Vault["mode"]
): Promise<PolicyVerificationResult> {
  const localHash = computePolicyHash(strategy, vaultName, mode)
  console.log(`[ens:policy] verifying policy integrity`, {
    ensName,
    vaultName,
    mode,
    localHash,
    strategyKeys: Object.keys(strategy),
  })
  const onChainHash = await readTextRecord(ensName, "policy.commitment")
  const match =
    onChainHash !== null &&
    onChainHash.toLowerCase() === localHash.toLowerCase()
  console.log(`[ens:policy] verification result`, {
    ensName,
    localHash,
    onChainHash,
    match,
    reason: onChainHash === null
      ? "on-chain record not found (subname may not exist or resolver not set)"
      : !match
        ? "hash mismatch (strategy changed since commitment)"
        : "hashes match",
  })
  return { match, localHash, onChainHash }
}
