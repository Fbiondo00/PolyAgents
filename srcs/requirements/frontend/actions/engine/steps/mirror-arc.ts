"use step"

// Arc contract settlement — full lifecycle:
//   1. createArcMarketOnDiscovery — create Arc market when Polymarket market is discovered
//   2. mirrorBetToArc — mirror filled bets to Arc (both YES and NO sides)
//   3. resolveArcMarket — resolve Arc market when Polymarket market expires
//   4. claimArcWinnings — claim winnings after resolution
//
// All operations are non-blocking: failures log warnings but don't fail the cycle.

import { getMarketState, saveMarketState, addAuditEvent } from "@/actions/engine/store"
import {
  createArcWalletClient,
  createArcPublicClient,
  createMarket,
  placeBet,
  resolveMarket,
  claimWinnings,
  getMarket as readArcMarket,
  getUserPosition,
  calculatePayout,
  getMarketCount,
  formatUsdc,
} from "@/lib/arc/market-client"
import { OUTCOME, type Outcome } from "@/lib/arc/abi"
import type { Address } from "viem"

// ── Config ──

function getArcConfig() {
  const pk = process.env.ARC_PRIVATE_KEY as `0x${string}` | undefined
  const contract = (process.env.NEXT_PUBLIC_POLYAGENTS_CONTRACT_ADDRESS || process.env.POLYAGENTS_CONTRACT_ADDRESS) as Address | undefined
  const usdc = (process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS || process.env.ARC_USDC_ADDRESS) as Address | undefined
  const network = process.env.ARC_NETWORK ?? "local"
  const rpcUrl = process.env.ARC_TESTNET_RPC_URL
  return { pk, contract, usdc, network, rpcUrl }
}

function isArcConfigured(): boolean {
  const c = getArcConfig()
  return !!(c.pk && c.contract && c.usdc)
}

// ── 1. Create Arc market at discovery time ──

export async function createArcMarketOnDiscovery(vaultId: string): Promise<number | null> {
  console.log(`[arc] createArcMarketOnDiscovery`, { vaultId })
  if (!isArcConfigured()) {
    console.warn(`[arc] not configured — skipping market creation`)
    return null
  }

  try {
    const config = getArcConfig()
    const rpcUrl = config.network === "testnet" ? config.rpcUrl : undefined
    const walletClient = createArcWalletClient(config.pk!, rpcUrl)
    const publicClient = createArcPublicClient(rpcUrl)

    const state = getMarketState(vaultId)
    if (!state?.market) {
      console.warn(`[arc] no active market — skipping`)
      return null
    }

    // Don't re-create if already set
    if (state.arcMarketId !== null) {
      console.log(`[arc] market already created`, { arcMarketId: state.arcMarketId })
      return state.arcMarketId
    }

    // hederaTopicId and policyHash are optional Arc market metadata
    // Vault data is client-side only (localStorage) — pass empty if unavailable
    const hederaTopicId = ""
    const policyHash = ""

    // Create market on Arc
    const resolutionTime = new Date(state.market.endTs * 1000)
    const result = await createMarket(walletClient, publicClient, config.contract!, {
      question: state.market.question,
      category: "Crypto",
      resolutionTime,
      hederaTopicId,
      policyHash,
    })

    const arcMarketId = Number(result.marketId)
    console.log(`[arc] market created on Arc`, { arcMarketId, txHash: result.txHash })

    // Persist to market state
    state.arcMarketId = arcMarketId
    state.arcResolved = false
    state.arcClaimed = false
    saveMarketState(vaultId, state)

    addAuditEvent(vaultId, {
      type: "ARC_MARKET_CREATED",
      arcMarketId,
      txHash: result.txHash,
      hederaTopicId,
      policyHash,
      timestamp: Date.now(),
    })

    return arcMarketId
  } catch (err) {
    console.warn(`[arc] market creation failed`, err)
    addAuditEvent(vaultId, {
      type: "ARC_MARKET_CREATE_FAILED",
      error: String(err),
      timestamp: Date.now(),
    })
    return null
  }
}

// ── 2. Mirror filled bets to Arc (per side) ──

export async function mirrorBetToArc(
  vaultId: string,
  side: "YES" | "NO",
  amount: number,
): Promise<{ success: boolean; arcMarketId?: number; error?: string }> {
  if (amount <= 0) return { success: false, error: "No fills to mirror" }
  if (!isArcConfigured()) {
    console.warn(`[arc] not configured — skipping bet mirror`)
    return { success: false, error: "Arc not configured" }
  }

  console.log(`[arc] mirrorBetToArc`, { vaultId, side, amount })

  try {
    const config = getArcConfig()
    const rpcUrl = config.network === "testnet" ? config.rpcUrl : undefined
    const walletClient = createArcWalletClient(config.pk!, rpcUrl)
    const publicClient = createArcPublicClient(rpcUrl)

    const state = getMarketState(vaultId)
    if (!state?.market) {
      console.warn(`[arc] no active market`)
      return { success: false, error: "No active market" }
    }

    const arcMarketId = state.arcMarketId
    if (arcMarketId === null) {
      console.warn(`[arc] no Arc market ID — create market first`)
      return { success: false, error: "No Arc market ID" }
    }

    // Place bet on Arc
    await placeBet(walletClient, publicClient, config.contract!, config.usdc!, {
      marketId: BigInt(arcMarketId),
      isYes: side === "YES",
      amountUsdc: amount,
    })

    console.log(`[arc] bet placed`, { arcMarketId, side, amount })

    addAuditEvent(vaultId, {
      type: "ARC_MIRROR",
      side,
      amount,
      arcMarketId,
      timestamp: Date.now(),
    })

    return { success: true, arcMarketId }
  } catch (err) {
    console.warn(`[arc] bet mirror failed`, err)
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

// ── 3. Resolve Arc market on Polymarket expiry ──

export async function resolveArcMarket(
  vaultId: string,
  outcome: "YES" | "NO",
): Promise<{ success: boolean; arcMarketId?: number; error?: string }> {
  if (!isArcConfigured()) return { success: false, error: "Arc not configured" }

  console.log(`[arc] resolveArcMarket`, { vaultId, outcome })

  try {
    const config = getArcConfig()
    const rpcUrl = config.network === "testnet" ? config.rpcUrl : undefined
    const walletClient = createArcWalletClient(config.pk!, rpcUrl)
    const publicClient = createArcPublicClient(rpcUrl)

    const state = getMarketState(vaultId)
    if (!state || state.arcMarketId === null) {
      console.warn(`[arc] no Arc market to resolve`)
      return { success: false, error: "No Arc market" }
    }

    if (state.arcResolved) {
      console.log(`[arc] already resolved`, { arcMarketId: state.arcMarketId })
      return { success: true, arcMarketId: state.arcMarketId }
    }

    const arcOutcome: Outcome = outcome === "YES" ? OUTCOME.YES : OUTCOME.NO
    const txHash = await resolveMarket(walletClient, publicClient, config.contract!, BigInt(state.arcMarketId), arcOutcome)

    console.log(`[arc] market resolved`, { arcMarketId: state.arcMarketId, outcome, txHash })

    state.arcResolved = true
    saveMarketState(vaultId, state)

    addAuditEvent(vaultId, {
      type: "ARC_MARKET_RESOLVED",
      arcMarketId: state.arcMarketId,
      outcome,
      txHash,
      timestamp: Date.now(),
    })

    return { success: true, arcMarketId: state.arcMarketId }
  } catch (err) {
    console.warn(`[arc] resolution failed`, err)
    addAuditEvent(vaultId, {
      type: "ARC_RESOLVE_FAILED",
      error: String(err),
      timestamp: Date.now(),
    })
    return { success: false, error: String(err) }
  }
}

// ── 4. Claim winnings after resolution ──

export async function claimArcWinnings(
  vaultId: string,
): Promise<{ success: boolean; payout?: string; error?: string }> {
  if (!isArcConfigured()) return { success: false, error: "Arc not configured" }

  console.log(`[arc] claimArcWinnings`, { vaultId })

  try {
    const config = getArcConfig()
    const rpcUrl = config.network === "testnet" ? config.rpcUrl : undefined
    const walletClient = createArcWalletClient(config.pk!, rpcUrl)
    const publicClient = createArcPublicClient(rpcUrl)

    const state = getMarketState(vaultId)
    if (!state || state.arcMarketId === null) {
      return { success: false, error: "No Arc market" }
    }

    if (state.arcClaimed) {
      console.log(`[arc] already claimed`)
      return { success: true }
    }

    if (!state.arcResolved) {
      return { success: false, error: "Market not resolved yet" }
    }

    // Check position on Arc
    const position = await getUserPosition(
      publicClient, config.contract!,
      BigInt(state.arcMarketId),
      walletClient.account!.address,
    )

    if (position.claimed) {
      console.log(`[arc] position already claimed on-chain`)
      state.arcClaimed = true
      saveMarketState(vaultId, state)
      return { success: true }
    }

    // Calculate potential payout
    const payout = await calculatePayout(
      publicClient, config.contract!,
      BigInt(state.arcMarketId),
      walletClient.account!.address,
    )

    if (payout === BigInt(0)) {
      console.log(`[arc] no payout — losing position`)
      state.arcClaimed = true
      saveMarketState(vaultId, state)
      return { success: true, payout: "0" }
    }

    // Claim winnings
    const txHash = await claimWinnings(
      walletClient, publicClient, config.contract!,
      BigInt(state.arcMarketId),
    )

    const payoutFormatted = formatUsdc(payout)
    console.log(`[arc] winnings claimed`, { arcMarketId: state.arcMarketId, payout: payoutFormatted, txHash })

    state.arcClaimed = true
    saveMarketState(vaultId, state)

    addAuditEvent(vaultId, {
      type: "ARC_WINNINGS_CLAIMED",
      arcMarketId: state.arcMarketId,
      payout: payoutFormatted,
      txHash,
      timestamp: Date.now(),
    })

    return { success: true, payout: payoutFormatted }
  } catch (err) {
    console.warn(`[arc] claim failed`, err)
    addAuditEvent(vaultId, {
      type: "ARC_CLAIM_FAILED",
      error: String(err),
      timestamp: Date.now(),
    })
    return { success: false, error: String(err) }
  }
}

// ── 5. Fetch Polymarket outcome for a market ──

export async function fetchPolymarketOutcome(slug: string): Promise<"YES" | "NO" | null> {
  try {
    const res = await fetch(`https://gamma-api.polymarket.com/markets?slug=${slug}`)
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) return null

    const market = data[0]
    // Polymarket Gamma returns "closed" and "resolved" fields
    if (!market.resolved && !market.closed) return null

    // outcomePrices is like ["0.85", "0.15"] — first is YES, second is NO
    const prices: string[] = market.outcomePrices ?? []
    if (prices.length < 2) return null

    const yesPrice = parseFloat(prices[0])
    const noPrice = parseFloat(prices[1])

    // The winning side has price 1.0, the losing side has price 0.0
    return yesPrice > noPrice ? "YES" : "NO"
  } catch (err) {
    console.warn(`[arc] failed to fetch Polymarket outcome`, err)
    return null
  }
}
