/**
 * Privy → viem wallet utility.
 *
 * Creates a viem WalletClient backed by a Privy embedded wallet's
 * EIP-1193 provider, so the USER signs transactions (not a server key).
 */

import { createWalletClient, createPublicClient, custom, http, type WalletClient } from "viem";
import type { Address } from "viem";
import { arcTestnet } from "./market-client";

const ARC_USDC_ADDRESS = (process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS || process.env.ARC_USDC_ADDRESS) as Address;
const ARC_EXPLORER = "https://explorer.testnet.arc.network";

const ERC20_ABI = [
  {
    type: "function" as const,
    name: "approve",
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function" as const,
    name: "balanceOf",
    stateMutability: "view" as const,
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/**
 * Create a viem WalletClient from a Privy embedded wallet.
 * The wallet must already be connected (from useWallets()).
 */
export async function getPrivyArcWalletClient(
  wallet: { address: string; getEthereumProvider: () => Promise<any> },
): Promise<WalletClient> {
  const provider = await wallet.getEthereumProvider();

  return createWalletClient({
    account: wallet.address as Address,
    chain: arcTestnet,
    transport: custom(provider),
  });
}

/** Arc public client (read-only, no signer). */
export function getArcPublicClient() {
  return createPublicClient({
    chain: arcTestnet,
    transport: http(),
  });
}

/** Read USDC balance on Arc for any address. */
export async function readUsdcBalance(address: Address): Promise<bigint> {
  const client = getArcPublicClient();
  return client.readContract({
    address: ARC_USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address],
  }) as Promise<bigint>;
}

/** Approve USDC on Arc — signed by the caller's Privy wallet. */
export async function approveUsdcFromPrivy(
  walletClient: WalletClient,
  spender: Address,
  amount: bigint,
): Promise<`0x${string}`> {
  const hash = await walletClient.writeContract({
    address: ARC_USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [spender, amount],
    chain: arcTestnet,
  } as any);
  return hash;
}

export { ARC_USDC_ADDRESS, ARC_EXPLORER, ERC20_ABI };
