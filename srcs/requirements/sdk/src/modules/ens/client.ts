import { createPublicClient, createWalletClient, http, fallback, type PublicClient, type WalletClient } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { sepolia } from "viem/chains"

const pk = process.env.ENS_OWNER_PRIVATE_KEY
const account = pk ? privateKeyToAccount(pk as `0x${string}`) : null

const rpcUrl = process.env.ENS_RPC_URL || ""
const FALLBACK_RPCS = [
  "https://1rpc.io/sepolia",
  "https://eth.drpc.org",
]

function buildTransport() {
  const urls = rpcUrl ? [rpcUrl, ...FALLBACK_RPCS] : FALLBACK_RPCS
  return fallback(urls.map((url) => http(url, { timeout: 15_000, retryCount: 2 })))
}

export const ensPublicClient: PublicClient = createPublicClient({
  chain: sepolia,
  transport: buildTransport(),
})

export const ensWalletClient: WalletClient | null = account
  ? createWalletClient({ chain: sepolia, account, transport: buildTransport() })
  : null

export const ENS_PUBLIC_RESOLVER = "0x64377398b2612cd8bda6fe39b845af49e52f512c" as const
export const ENS_BASE_DOMAIN: string = process.env.ENS_BASE_DOMAIN || "polyagents.eth"
