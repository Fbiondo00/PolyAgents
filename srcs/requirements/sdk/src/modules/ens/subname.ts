import { namehash, labelhash } from "viem/ens"
import { ensWalletClient, ensPublicClient, ENS_PUBLIC_RESOLVER, ENS_BASE_DOMAIN } from "./client"
import { ENS_REGISTRY } from "@polyagents/schema"

function getWallet() {
  if (!ensWalletClient) throw new Error("ENS wallet not configured — set ENS_OWNER_PRIVATE_KEY")
  return ensWalletClient
}

const RESOLVER_ABI = [
  { name: "setText", type: "function", stateMutability: "nonpayable", inputs: [{ name: "node", type: "bytes32" }, { name: "key", type: "string" }, { name: "value", type: "string" }], outputs: [] },
  { name: "text", type: "function", stateMutability: "view", inputs: [{ name: "node", type: "bytes32" }, { name: "key", type: "string" }], outputs: [{ name: "", type: "string" }] },
  { name: "supportsInterface", type: "function", stateMutability: "view", inputs: [{ name: "interfaceId", type: "bytes4" }], outputs: [{ name: "", type: "bool" }] },
] as const

const REGISTRY_ABI = [
  { name: "setSubnodeOwner", type: "function", stateMutability: "nonpayable", inputs: [{ name: "node", type: "bytes32" }, { name: "label", type: "bytes32" }, { name: "owner", type: "address" }], outputs: [] },
  { name: "setResolver", type: "function", stateMutability: "nonpayable", inputs: [{ name: "node", type: "bytes32" }, { name: "resolver", type: "address" }], outputs: [] },
] as const

export function slugify(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 32)
}

export function buildEnsName(vaultId: string): string {
  return `${slugify(vaultId)}.${ENS_BASE_DOMAIN}`
}

export interface SubnameResult { ensName: string; createTxHash: string; resolverTxHash: string }

export async function createVaultSubname(vaultId: string): Promise<SubnameResult> {
  const label = slugify(vaultId)
  const ensName = `${label}.${ENS_BASE_DOMAIN}`
  const parentNode = namehash(ENS_BASE_DOMAIN)
  const fullNode = namehash(ensName)
  const wallet = getWallet()
  const account = wallet.account!

  const createTxHash = await wallet.writeContract({
    account,
    address: ENS_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: "setSubnodeOwner",
    args: [parentNode, labelhash(label), account.address],
  } as any)
  await ensPublicClient.waitForTransactionReceipt({ hash: createTxHash })

  const resolverTxHash = await wallet.writeContract({
    account,
    address: ENS_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: "setResolver",
    args: [fullNode, ENS_PUBLIC_RESOLVER],
  } as any)
  await ensPublicClient.waitForTransactionReceipt({ hash: resolverTxHash })

  return { ensName, createTxHash, resolverTxHash }
}

export async function readTextRecord(ensName: string, key: string): Promise<string | null> {
  const node = namehash(ensName)
  try {
    const value = await ensPublicClient.readContract({ address: ENS_PUBLIC_RESOLVER, abi: RESOLVER_ABI, functionName: "text", args: [node, key] })
    return (value as string) || null
  } catch {
    return null
  }
}

export async function setTextRecord(ensName: string, key: string, value: string): Promise<string> {
  const node = namehash(ensName)
  const wallet = getWallet()
  const txHash = await wallet.writeContract({
    account: wallet.account!,
    address: ENS_PUBLIC_RESOLVER,
    abi: RESOLVER_ABI,
    functionName: "setText",
    args: [node, key, value],
  } as any)
  await ensPublicClient.waitForTransactionReceipt({ hash: txHash })
  return txHash
}

export async function batchSetTextRecords(ensName: string, records: [string, string][]): Promise<string[]> {
  const txHashes: string[] = []
  for (const [key, value] of records) {
    const txHash = await setTextRecord(ensName, key, value)
    txHashes.push(txHash)
  }
  return txHashes
}
