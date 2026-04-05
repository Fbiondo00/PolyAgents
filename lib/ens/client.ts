import { createPublicClient, createWalletClient, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { sepolia } from "viem/chains"

const account = privateKeyToAccount(
  process.env.NEXT_PUBLIC_ENS_OWNER_PRIVATE_KEY as `0x${string}`
)

export const ensPublicClient = createPublicClient({
  chain: sepolia,
  transport: http(process.env.NEXT_PUBLIC_ENS_RPC_URL),
})

export const ensWalletClient = createWalletClient({
  chain: sepolia,
  account,
  transport: http(process.env.NEXT_PUBLIC_ENS_RPC_URL),
})

export const ENS_REGISTRY =
  "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e" as const
export const ENS_TEXT_RESOLVER =
  "0x5d457Bf3D59dAb30BC024aAE4251c691dC7038fe" as const
export const ENS_BASE_DOMAIN: string =
  process.env.NEXT_PUBLIC_ENS_BASE_DOMAIN || "polyagents.eth"
