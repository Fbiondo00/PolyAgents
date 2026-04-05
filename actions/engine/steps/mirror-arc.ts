"use step"

// Mirror Polymarket bets to Arc vault contract (PolyAgentsMarket.sol)
// Non-blocking: Arc mirror failure logs a warning but doesn't fail the cycle

import { getMarketState, addAuditEvent } from "@/actions/engine/store"
import {
  createArcWalletClient,
  createArcPublicClient,
  createMarket,
  placeBet,
  getMarketCount,
  type Address,
} from "@/lib/arc/market-client"

function getArcConfig() {
  const pk = process.env.ARC_PRIVATE_KEY as `0x${string}` | undefined
  const contract = (process.env.NEXT_PUBLIC_POLYAGENTS_CONTRACT_ADDRESS || process.env.POLYAGENTS_CONTRACT_ADDRESS) as Address | undefined
  const usdc = (process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS || process.env.ARC_USDC_ADDRESS) as Address | undefined
  const network = process.env.ARC_NETWORK ?? "local"
  const rpcUrl = process.env.ARC_TESTNET_RPC_URL

  return { pk, contract, usdc, network, rpcUrl }
}

export async function mirrorBetToArc(
  vaultId: string,
  side: "YES" | "NO",
  amount: number,
): Promise<{ success: boolean; arcMarketId?: number; error?: string }> {
  console.log(`[mirror-arc] attempting mirror`, { vaultId, side, amount })
  const config = getArcConfig()
  if (!config.pk || !config.contract || !config.usdc) {
    console.warn(`[mirror-arc] Arc not configured`)
    return { success: false, error: "Arc not configured (missing env vars)" }
  }

  try {
    const rpcUrl = config.network === "testnet" ? config.rpcUrl : undefined
    const walletClient = createArcWalletClient(config.pk, rpcUrl)
    const publicClient = createArcPublicClient(rpcUrl)

    // Get or create the market on Arc
    const state = getMarketState(vaultId)
    if (!state?.market) {
      console.warn(`[mirror-arc] no active market`)
      return { success: false, error: "No active market" }
    }

    const arcMarketId = await getOrCreateArcMarket(
      walletClient,
      publicClient,
      config.contract,
      state.market.question,
      state.market.endTs,
    )

    console.log(`[mirror-arc] Arc market created/retrieved`, { marketId: arcMarketId })

    // Place bet on Arc
    await placeBet(walletClient, publicClient, config.contract, config.usdc, {
      marketId: BigInt(arcMarketId),
      isYes: side === "YES",
      amountUsdc: amount,
    })

    console.log(`[mirror-arc] bet placed on Arc`, { marketId: arcMarketId })

    addAuditEvent(vaultId, {
      type: "ARC_MIRROR",
      side,
      amount,
      arcMarketId,
      timestamp: Date.now(),
    })

    return { success: true, arcMarketId }
  } catch (err) {
    console.warn(`[mirror-arc] mirror failed`, err)
    addAuditEvent(vaultId, {
      type: "ARC_MIRROR_FAILED",
      side,
      amount,
      error: String(err),
      timestamp: Date.now(),
    })
    return { success: false, error: String(err) }
  }
}

// Cache Arc market IDs per conditionId to avoid re-creating
const arcMarketCache = new Map<string, number>()

async function getOrCreateArcMarket(
  walletClient: any,
  publicClient: any,
  contractAddress: Address,
  question: string,
  endTs: number,
): Promise<number> {
  const cacheKey = `${question}-${endTs}`
  if (arcMarketCache.has(cacheKey)) {
    return arcMarketCache.get(cacheKey)!
  }

  // Count existing markets — use next ID
  const count = await getMarketCount(publicClient, contractAddress)
  const marketId = Number(count)

  const resolutionTime = new Date(endTs * 1000)

  await createMarket(walletClient, publicClient, contractAddress, {
    question,
    category: "Crypto",
    resolutionTime,
    hederaTopicId: "",
    policyHash: "",
  })

  arcMarketCache.set(cacheKey, marketId)
  return marketId
}
