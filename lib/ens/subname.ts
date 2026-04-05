import { namehash, labelhash } from "viem/ens"
import {
  ensWalletClient,
  ensPublicClient,
  ENS_REGISTRY,
  ENS_PUBLIC_RESOLVER,
  ENS_BASE_DOMAIN,
} from "./client"

// Wallet client is null when NEXT_PUBLIC_ENS_OWNER_PRIVATE_KEY is not set.
// These functions are only called at runtime (not at module load), so we
// throw a clear error instead of crashing on import.
function getWallet() {
  if (!ensWalletClient) throw new Error("ENS wallet not configured — set NEXT_PUBLIC_ENS_OWNER_PRIVATE_KEY")
  return ensWalletClient
}

// ── ABIs ──
// New ABI (ENSIP-1): key as plain string — the standard used by ENS app & universal resolver
const RESOLVER_ABI = [
  {
    name: "setText",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "text",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
    ],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "supportsInterface",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "interfaceId", type: "bytes4" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const

const REGISTRY_ABI = [
  {
    name: "setSubnodeOwner",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "label", type: "bytes32" },
      { name: "owner", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "setResolver",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "resolver", type: "address" },
    ],
    outputs: [],
  },
] as const

// ── Helpers ──

/**
 * Convert a vault ID into a valid ENS label (lowercase, alphanumeric + hyphens, max 32 chars).
 */
export function slugify(id: string): string {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32)
}

/**
 * Build the full ENS name for a vault.
 */
export function buildEnsName(vaultId: string): string {
  return `${slugify(vaultId)}.${ENS_BASE_DOMAIN}`
}

// ── Subname Creation ──

export interface SubnameResult {
  ensName: string
  createTxHash: string
  resolverTxHash: string
}

/**
 * Create an ENS subname for a vault/agent.
 * Label = slugified vault ID.
 * Full name = {label}.polyagents.eth
 *
 * Two transactions: setSubnodeOwner + setResolver.
 */
export async function createVaultSubname(
  vaultId: string
): Promise<SubnameResult> {
  const label = slugify(vaultId)
  const ensName = `${label}.${ENS_BASE_DOMAIN}`
  const parentNode = namehash(ENS_BASE_DOMAIN)
  const fullNode = namehash(ensName)

  console.log(`[ens:subname] creating subname`, {
    vaultId,
    label,
    ensName,
    baseDomain: ENS_BASE_DOMAIN,
    parentNode,
    fullNode,
    owner: getWallet().account.address,
    registry: ENS_REGISTRY,
    resolver: ENS_PUBLIC_RESOLVER,
  })

  // 1. Create subdomain (setSubnodeOwner)
  console.log(`[ens:subname] step 1: setSubnodeOwner`)
  const createTxHash = await getWallet().writeContract({
    address: ENS_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: "setSubnodeOwner",
    args: [
      parentNode,
      labelhash(label),
      getWallet().account.address,
    ],
  })
  const createReceipt = await ensPublicClient.waitForTransactionReceipt({ hash: createTxHash })
  console.log(`[ens:subname] setSubnodeOwner tx confirmed`, {
    txHash: createTxHash,
    status: createReceipt.status,
  })

  // 2. Set resolver to public resolver
  console.log(`[ens:subname] step 2: setResolver`)
  const resolverTxHash = await getWallet().writeContract({
    address: ENS_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: "setResolver",
    args: [fullNode, ENS_PUBLIC_RESOLVER],
  })
  const resolverReceipt = await ensPublicClient.waitForTransactionReceipt({ hash: resolverTxHash })
  console.log(`[ens:subname] setResolver tx confirmed`, {
    txHash: resolverTxHash,
    status: resolverReceipt.status,
  })

  return { ensName, createTxHash, resolverTxHash }
}

// ── Text Record Read / Write ──

/**
 * Read a single text record from an ENS name.
 * Returns null if the record doesn't exist or resolution fails.
 */
export async function readTextRecord(
  ensName: string,
  key: string
): Promise<string | null> {
  const node = namehash(ensName)
  console.log(`[ens:read] reading text record`, {
    ensName,
    key,
    node,
    resolver: ENS_PUBLIC_RESOLVER,
  })
  try {
    const value = await ensPublicClient.readContract({
      address: ENS_PUBLIC_RESOLVER,
      abi: RESOLVER_ABI,
      functionName: "text",
      args: [node, key],
    })
    const result = (value as string) || null
    console.log(`[ens:read] text record result`, {
      ensName,
      key,
      value: result,
      length: result?.length ?? 0,
    })
    return result
  } catch (err) {
    console.warn(`[ens:read] FAILED to read text record`, {
      ensName,
      key,
      node,
      resolver: ENS_PUBLIC_RESOLVER,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Write a single text record on an ENS name.
 * Returns the transaction hash after confirmation.
 */
export async function setTextRecord(
  ensName: string,
  key: string,
  value: string
): Promise<string> {
  const node = namehash(ensName)
  console.log(`[ens:write] writing text record`, {
    ensName,
    key,
    value: value.length > 66 ? `${value.slice(0, 16)}...${value.slice(-8)}` : value,
    node,
    resolver: ENS_PUBLIC_RESOLVER,
    from: getWallet().account.address,
  })
  const txHash = await getWallet().writeContract({
    address: ENS_PUBLIC_RESOLVER,
    abi: RESOLVER_ABI,
    functionName: "setText",
    args: [node, key, value],
  })
  const receipt = await ensPublicClient.waitForTransactionReceipt({ hash: txHash })
  console.log(`[ens:write] text record tx confirmed`, {
    ensName,
    key,
    txHash,
    status: receipt.status,
  })
  return txHash
}

/**
 * Batch write multiple text records on an ENS name.
 * Executes sequentially (each setText is its own tx).
 */
export async function batchSetTextRecords(
  ensName: string,
  records: [string, string][]
): Promise<string[]> {
  const txHashes: string[] = []
  for (const [key, value] of records) {
    const txHash = await setTextRecord(ensName, key, value)
    txHashes.push(txHash)
  }
  return txHashes
}
