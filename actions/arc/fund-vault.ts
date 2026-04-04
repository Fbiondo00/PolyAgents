"use server";

import {
  createArcPublicClient,
  createArcWalletClient,
  createLocalPublicClient,
  createLocalWalletClient,
  getUsdcBalance,
  approveUsdc,
  formatUsdc,
  parseUsdc,
  arcTestnet,
} from "@/lib/arc/market-client";
import type { Address } from "viem";

// ── Config ──

function getConfig() {
  const contractAddress = process.env.POLYAGENTS_CONTRACT_ADDRESS as Address;
  const usdcAddress = process.env.ARC_USDC_ADDRESS as Address;
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

function getPublicClient() {
  const cfg = getConfig();
  return cfg.isLocal ? createLocalPublicClient() : createArcPublicClient(cfg.rpcUrl);
}

function getWalletClient() {
  const cfg = getConfig();
  return cfg.isLocal ? createLocalWalletClient(cfg.privateKey) : createArcWalletClient(cfg.privateKey, cfg.rpcUrl);
}

// ── Actions ──

/**
 * Read the on-chain USDC balance for a given address on Arc.
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

/**
 * Approve USDC for the PolyAgentsMarket contract.
 * Returns the approval tx hash and updated balance.
 */
export async function approveVaultFunding(opts: {
  amountUsdc: number;
}): Promise<{ success: true; approveTxHash: string; balanceAfter: string; explorerUrl: string } | { success: false; error: string }> {
  console.log("[fund-vault] approveVaultFunding", { amountUsdc: opts.amountUsdc });

  try {
    const walletClient = getWalletClient();
    const publicClient = getPublicClient();
    const cfg = getConfig();

    const amount = parseUsdc(opts.amountUsdc);
    const spender = walletClient.account!.address;

    // Approve USDC
    const approveTxHash = await approveUsdc(
      walletClient,
      cfg.usdcAddress,
      cfg.contractAddress,
      amount,
    );

    await publicClient.waitForTransactionReceipt({ hash: approveTxHash });

    // Read updated allowance/balance
    const balanceAfter = await getUsdcBalance(publicClient, cfg.usdcAddress, spender);
    const formatted = formatUsdc(balanceAfter);

    const explorerBase = cfg.isLocal ? "http://127.0.0.1:8545" : "https://explorer.testnet.arc.network";

    console.log("[fund-vault] approved", { approveTxHash, balanceAfter: formatted });

    return {
      success: true,
      approveTxHash,
      balanceAfter: formatted,
      explorerUrl: `${explorerBase}/tx/${approveTxHash}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[fund-vault] approve failed:", message);
    return { success: false, error: message };
  }
}
