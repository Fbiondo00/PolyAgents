export const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e"
export const ENS_PUBLIC_RESOLVER_SEPOLIA = "0x64377398b2612cd8bda6fe39b845af49e52f512c"

export const ENS_FALLBACK_RPCS = [
  "https://1rpc.io/sepolia",
  "https://eth.drpc.org",
]

export function getEnsConfig() {
  return {
    rpcUrl: process.env.ENS_RPC_URL ?? ENS_FALLBACK_RPCS[0],
    ownerPrivateKey: process.env.ENS_OWNER_PRIVATE_KEY ?? "",
    baseDomain: process.env.ENS_BASE_DOMAIN ?? "polyagents.eth",
    registry: ENS_REGISTRY,
    resolver: ENS_PUBLIC_RESOLVER_SEPOLIA,
  }
}
