import { keccak256, toBytes, type Hex } from "viem"
import { setTextRecord, readTextRecord } from "./subname"
import type { Vault } from "@polyagents/schema"

export function computePolicyHash(strategy: Vault["strategy"], vaultName: string, mode: Vault["mode"]): Hex {
  const serialized = JSON.stringify({
    n: vaultName, m: mode,
    s: { bp: strategy.bidPrice, sp: strategy.sellPrice, mc: strategy.maxCapital, ts: strategy.trancheSize, ne: strategy.noNewEntriesLast, ks: strategy.keepSellAfter, ai: strategy.aiEnabled },
  })
  return keccak256(toBytes(serialized))
}

export async function commitPolicyHash(ensName: string, policyHash: Hex): Promise<string> {
  return setTextRecord(ensName, "policy.commitment", policyHash)
}

export interface PolicyVerificationResult { match: boolean; localHash: Hex; onChainHash: string | null }

export async function verifyPolicyIntegrity(ensName: string, strategy: Vault["strategy"], vaultName: string, mode: Vault["mode"]): Promise<PolicyVerificationResult> {
  const localHash = computePolicyHash(strategy, vaultName, mode)
  const onChainHash = await readTextRecord(ensName, "policy.commitment")
  const match = onChainHash !== null && onChainHash.toLowerCase() === localHash.toLowerCase()
  return { match, localHash, onChainHash }
}
