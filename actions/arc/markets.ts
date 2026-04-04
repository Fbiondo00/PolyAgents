"use server";

import {
  createArcPublicClient,
  createArcWalletClient,
  createLocalPublicClient,
  createLocalWalletClient,
  getMarket,
  getMarketFormatted,
  getUserPosition,
  getOdds,
  calculatePayout,
  getMarketCount,
  createMarket,
  placeBet,
  resolveMarket,
  claimWinnings,
  formatUsdc,
  type MarketDataFormatted,
  type MarketOdds,
  type PositionData,
  OUTCOME,
  type Outcome,
  arcTestnet,
  localAnvil,
} from "@/lib/arc/market-client";
import type { Address } from "viem";

// ── Config from env ──

function getConfig() {
  const contractAddress = process.env.POLYAGENTS_CONTRACT_ADDRESS as Address;
  const usdcAddress = (process.env.ARC_USDC_ADDRESS || process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS) as Address;
  const privateKey = process.env.ARC_PRIVATE_KEY as `0x${string}`;
  const rpcUrl = process.env.ARC_TESTNET_RPC_URL;

  const isLocal = process.env.ARC_NETWORK === "local";

  if (isLocal) {
    return {
      isLocal: true,
      contractAddress: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0" as Address,
      usdcAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address,
      privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`,
      rpcUrl: "http://127.0.0.1:8545",
    };
  }

  return { isLocal: false, contractAddress, usdcAddress, privateKey, rpcUrl };
}

// ── Shared client helpers ──

function getPublicClient() {
  const cfg = getConfig();
  return cfg.isLocal
    ? createLocalPublicClient()
    : createArcPublicClient(cfg.rpcUrl);
}

function getWalletClient() {
  const cfg = getConfig();
  return cfg.isLocal
    ? createLocalWalletClient(cfg.privateKey)
    : createArcWalletClient(cfg.privateKey, cfg.rpcUrl);
}

// ── Result types ──

interface ArcError {
  success: false
  error: string
}

// ── Read actions ──

export async function fetchMarket(marketId: number): Promise<MarketDataFormatted | ArcError> {
  try {
    const publicClient = getPublicClient();
    const cfg = getConfig();
    return await getMarketFormatted(publicClient, cfg.contractAddress, BigInt(marketId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false as const, error: message };
  }
}

export async function fetchMarketCount(): Promise<number> {
  try {
    const publicClient = getPublicClient();
    const cfg = getConfig();
    const count = await getMarketCount(publicClient, cfg.contractAddress);
    return Number(count);
  } catch {
    return 0;
  }
}

export async function fetchAllMarkets(): Promise<MarketDataFormatted[] | ArcError> {
  try {
    const publicClient = getPublicClient();
    const cfg = getConfig();
    const count = await getMarketCount(publicClient, cfg.contractAddress);
    const markets: MarketDataFormatted[] = [];

    for (let i = 1; i <= Number(count); i++) {
      const m = await getMarketFormatted(publicClient, cfg.contractAddress, BigInt(i));
      markets.push(m);
    }

    return markets;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false as const, error: message };
  }
}

export async function fetchOdds(marketId: number): Promise<MarketOdds | ArcError> {
  try {
    const publicClient = getPublicClient();
    const cfg = getConfig();
    return await getOdds(publicClient, cfg.contractAddress, BigInt(marketId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false as const, error: message };
  }
}

export async function fetchUserPosition(
  marketId: number,
  userAddress: string,
): Promise<PositionData | ArcError> {
  try {
    const publicClient = getPublicClient();
    const cfg = getConfig();
    return await getUserPosition(publicClient, cfg.contractAddress, BigInt(marketId), userAddress as Address);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false as const, error: message };
  }
}

export async function fetchPayout(
  marketId: number,
  userAddress: string,
): Promise<string> {
  try {
    const publicClient = getPublicClient();
    const cfg = getConfig();
    const payout = await calculatePayout(
      publicClient,
      cfg.contractAddress,
      BigInt(marketId),
      userAddress as Address,
    );
    return formatUsdc(payout);
  } catch {
    return "0";
  }
}

// ── Write actions (require wallet) ──

export async function createPredictionMarket(opts: {
  question: string;
  category: string;
  resolutionTime: Date;
  hederaTopicId: string;
  policyHash: string;
}): Promise<{ success: true; marketId: number; txHash: string } | ArcError> {
  try {
    const walletClient = getWalletClient();
    const publicClient = getPublicClient();
    const cfg = getConfig();

    const result = await createMarket(walletClient, publicClient, cfg.contractAddress, opts);
    return {
      success: true as const,
      marketId: Number(result.marketId),
      txHash: result.txHash,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false as const, error: message };
  }
}

export async function placeBetOnMarket(opts: {
  marketId: number;
  isYes: boolean;
  amountUsdc: number;
}): Promise<{ success: true; txHash: string } | ArcError> {
  try {
    const walletClient = getWalletClient();
    const publicClient = getPublicClient();
    const cfg = getConfig();

    const txHash = await placeBet(
      walletClient,
      publicClient,
      cfg.contractAddress,
      cfg.usdcAddress,
      {
        marketId: BigInt(opts.marketId),
        isYes: opts.isYes,
        amountUsdc: opts.amountUsdc,
      },
    );

    return { success: true as const, txHash };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false as const, error: message };
  }
}

export async function resolvePredictionMarket(opts: {
  marketId: number;
  outcome: "YES" | "NO" | "VOIDED";
}): Promise<{ success: true; txHash: string } | ArcError> {
  try {
    const walletClient = getWalletClient();
    const publicClient = getPublicClient();
    const cfg = getConfig();

    const outcomeMap: Record<string, Outcome> = {
      YES: OUTCOME.YES,
      NO: OUTCOME.NO,
      VOIDED: OUTCOME.VOIDED,
    };

    const txHash = await resolveMarket(
      walletClient,
      publicClient,
      cfg.contractAddress,
      BigInt(opts.marketId),
      outcomeMap[opts.outcome],
    );

    return { success: true as const, txHash };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false as const, error: message };
  }
}

export async function claimMarketWinnings(
  marketId: number,
): Promise<{ success: true; txHash: string; amount: string } | ArcError> {
  try {
    const walletClient = getWalletClient();
    const publicClient = getPublicClient();
    const cfg = getConfig();

    const payoutBefore = await calculatePayout(
      publicClient,
      cfg.contractAddress,
      BigInt(marketId),
      walletClient.account!.address,
    );

    const txHash = await claimWinnings(
      walletClient,
      publicClient,
      cfg.contractAddress,
      BigInt(marketId),
    );

    return {
      success: true as const,
      txHash,
      amount: formatUsdc(payoutBefore),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false as const, error: message };
  }
}
