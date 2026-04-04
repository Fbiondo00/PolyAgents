"use server";

import { createArcPublicClient, createLocalPublicClient, getMarketFormatted, getUserPosition, getOdds, getMarketCount, getUsdcBalance, formatUsdc, type MarketDataFormatted, type PositionData, type MarketOdds } from "@/lib/arc/market-client";
import type { Address } from "viem";

// ── Config ──

function getConfig() {
  const contractAddress = process.env.POLYAGENTS_CONTRACT_ADDRESS as Address;
  const usdcAddress = process.env.ARC_USDC_ADDRESS as Address;
  const rpcUrl = process.env.ARC_TESTNET_RPC_URL;
  const isLocal = process.env.ARC_NETWORK === "local";

  if (isLocal) {
    return {
      isLocal: true,
      contractAddress: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0" as Address,
      usdcAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address,
      rpcUrl: "http://127.0.0.1:8545",
    };
  }

  return { isLocal: false, contractAddress, usdcAddress, rpcUrl };
}

function getPublicClient() {
  const cfg = getConfig();
  return cfg.isLocal ? createLocalPublicClient() : createArcPublicClient(cfg.rpcUrl);
}

// ── Types (re-exported for client) ──

export type OnChainMarket = MarketDataFormatted & { odds?: MarketOdds; position?: PositionData }

export interface SyncedVaultData {
  usdcBalance: string;
  marketCount: number;
  markets: OnChainMarket[];
}

/**
 * Sync vault data from on-chain Arc contracts.
 * Reads USDC balance, all markets, odds, and user positions.
 */
export async function syncVaultFromChain(userAddress?: string): Promise<SyncedVaultData> {
  console.log("[arc-sync] syncVaultFromChain called", { userAddress });

  try {
    const publicClient = getPublicClient();
    const cfg = getConfig();

    // Parallel: balance + market count
    const [rawBalance, rawCount] = await Promise.all([
      userAddress
        ? getUsdcBalance(publicClient, cfg.usdcAddress, userAddress as Address)
        : Promise.resolve(BigInt(0)),
      getMarketCount(publicClient, cfg.contractAddress),
    ]);

    const usdcBalance = formatUsdc(rawBalance);
    const marketCount = Number(rawCount);
    console.log("[arc-sync] on-chain read", { usdcBalance, marketCount });

    // Fetch all markets with odds + positions
    const markets: OnChainMarket[] = [];

    for (let i = 1; i <= marketCount; i++) {
      try {
        const m = await getMarketFormatted(publicClient, cfg.contractAddress, BigInt(i));

        // Fetch odds + position in parallel
        const [odds, position] = await Promise.all([
          getOdds(publicClient, cfg.contractAddress, BigInt(i)).catch(() => undefined),
          userAddress
            ? getUserPosition(publicClient, cfg.contractAddress, BigInt(i), userAddress as Address).catch(() => undefined)
            : Promise.resolve(undefined),
        ]);

        markets.push({ ...m, odds, position });
      } catch (err) {
        console.warn(`[arc-sync] failed to fetch market ${i}:`, err);
      }
    }

    console.log("[arc-sync] sync complete", { marketCount: markets.length, usdcBalance });

    return { usdcBalance, marketCount, markets };
  } catch (error) {
    console.error("[arc-sync] sync failed:", error);
    return { usdcBalance: "0", marketCount: 0, markets: [] };
  }
}
