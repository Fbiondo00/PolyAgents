"use server";

import {
  createArcPublicClient,
  createLocalPublicClient,
  getUsdcBalance,
  formatUsdc,
} from "@/lib/arc/market-client";
import type { Address } from "viem";

// ── Config ──

function getConfig() {
  const usdcAddress = (process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS || process.env.ARC_USDC_ADDRESS) as Address;
  const rpcUrl = process.env.ARC_TESTNET_RPC_URL;
  const isLocal = process.env.ARC_NETWORK === "local";

  if (isLocal) {
    return {
      isLocal: true,
      usdcAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address,
      rpcUrl: "http://127.0.0.1:8545",
    };
  }

  return { isLocal: false, usdcAddress, rpcUrl };
}

function getPublicClient() {
  const cfg = getConfig();
  return cfg.isLocal ? createLocalPublicClient() : createArcPublicClient(cfg.rpcUrl);
}

// ── Actions ──

/**
 * Read the on-chain USDC balance for a given address on Arc.
 * Approval now happens client-side via the user's Privy wallet.
 */
export async function fetchUsdcBalance(userAddress: string): Promise<string> {
  console.log("[fund-vault] fetchUsdcBalance", { userAddress });
  try {
    const publicClient = getPublicClient();
    const cfg = getConfig();
    const raw = await getUsdcBalance(publicClient, cfg.usdcAddress, userAddress as Address);
    return formatUsdc(raw);
  } catch (error) {
    console.error("[fund-vault] fetchUsdcBalance failed:", error);
    return "0";
  }
}
