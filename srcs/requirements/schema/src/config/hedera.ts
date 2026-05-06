export function getHederaConfig() {
  return {
    operatorId: process.env.HEDERA_OPERATOR_ID ?? "",
    operatorKey: process.env.HEDERA_OPERATOR_KEY ?? "",
    network: (process.env.HEDERA_NETWORK ?? "testnet") as "testnet" | "mainnet",
    mirrorNodeUrl: `https://${process.env.HEDERA_NETWORK ?? "testnet"}.mirrornode.hedera.com/api/v1`,
  }
}
