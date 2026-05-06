export function getArcConfig() {
  const network = process.env.ARC_NETWORK ?? "testnet"
  const isLocal = network === "local"

  return {
    chainId: isLocal ? 31337 : 5042002,
    rpcUrl: isLocal ? "http://127.0.0.1:8545" : (process.env.ARC_TESTNET_RPC_URL ?? "https://rpc.testnet.arc.network"),
    explorer: isLocal ? "http://127.0.0.1:8545" : "https://explorer.testnet.arc.network",
    usdcAddress: process.env.ARC_USDC_ADDRESS ?? (isLocal ? "0x5FbDB2315678afecb367f032d93F642f64180aa3" : "0x3600000000000000000000000000000000000000"),
    contractAddress: process.env.POLYAGENTS_CONTRACT_ADDRESS ?? (isLocal ? "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0" : ""),
  }
}
