import { createPublicClient, createWalletClient, http, fallback } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { sepolia } from "viem/chains"

const pk = process.env.NEXT_PUBLIC_ENS_OWNER_PRIVATE_KEY
const account = pk ? privateKeyToAccount(pk as `0x${string}`) : null

// Build fallback RPC transport — tries multiple providers in sequence
const rpcUrl = process.env.NEXT_PUBLIC_ENS_RPC_URL || ""
const FALLBACK_RPCS = [
  "https://1rpc.io/sepolia",
  "https://eth.drpc.org",
]

function buildTransport() {
  const urls = rpcUrl ? [rpcUrl, ...FALLBACK_RPCS] : FALLBACK_RPCS
  return fallback(
    urls.map((url) =>
      http(url, {
        timeout: 15_000,
        retryCount: 2,
      })
    )
  )
}

export const ensPublicClient = createPublicClient({
  chain: sepolia,
  transport: buildTransport(),
})

export const ensWalletClient = account
  ? createWalletClient({
      chain: sepolia,
      account,
      transport: buildTransport(),
    })
  : null

export const ENS_REGISTRY =
  "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e" as const
export const ENS_PUBLIC_RESOLVER =
  "0x64377398b2612cd8bda6fe39b845af49e52f512c" as const
export const ENS_BASE_DOMAIN: string =
  process.env.NEXT_PUBLIC_ENS_BASE_DOMAIN || "polyagents.eth"

// Log ENS config on module load
console.log(`[ens:config] ENS client initialized`, {
  chain: sepolia.id,
  owner: account?.address ?? "none",
  registry: ENS_REGISTRY,
  textResolver: ENS_PUBLIC_RESOLVER,
  baseDomain: ENS_BASE_DOMAIN,
  primaryRpc: rpcUrl || "none",
  fallbackRpcs: FALLBACK_RPCS,
  hasPrivateKey: !!pk,
})
