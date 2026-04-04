import { createPublicClient, createWalletClient, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { sepolia } from "viem/chains"

export const ENS_REGISTRY =
  "0x00000000000C2e074eC69A0dFb2997BA6C7d2e1e" as const
export const ENS_PUBLIC_RESOLVER =
  "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63" as const
export const ENS_BASE_DOMAIN = (
  process.env.NEXT_PUBLIC_ENS_BASE_DOMAIN || "polyagents.eth"
) as const

export const ensPublicClient = createPublicClient({
  chain: sepolia,
  transport: http(process.env.NEXT_PUBLIC_ENS_RPC_URL),
})

// Lazy-init wallet client to avoid crash when env var is missing at build/SSR time
let _walletClient: ReturnType<typeof createWalletClient> | null = null

export function getEnsWalletClient() {
  if (!_walletClient) {
    const pk = process.env.NEXT_PUBLIC_ENS_OWNER_PRIVATE_KEY
    if (!pk) throw new Error("NEXT_PUBLIC_ENS_OWNER_PRIVATE_KEY not set")
    const account = privateKeyToAccount(pk as `0x${string}`)
    _walletClient = createWalletClient({
      chain: sepolia,
      account,
      transport: http(process.env.NEXT_PUBLIC_ENS_RPC_URL),
    })
  }
  return _walletClient
}

/** @deprecated Use getEnsWalletClient() instead */
export const ensWalletClient = new Proxy({} as ReturnType<typeof createWalletClient>, {
  get(_target, prop) {
    return Reflect.get(getEnsWalletClient(), prop)
  },
})
