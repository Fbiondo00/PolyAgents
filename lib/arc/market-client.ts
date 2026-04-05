/**
 * PolyAgentsMarket client — typed wrappers around the on-chain contract.
 *
 * Supports two usage modes:
 *   1. Server-side: pass a viem PublicClient/WalletClient (for agent scripts, API routes)
 *   2. Client-side: pass a Privy wallet + viem PublicClient (for React components)
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  type PublicClient,
  type WalletClient,
  type Address,
  type Hash,
  defineChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { POLYAGENTS_ABI, OUTCOME, type Outcome } from "./abi";

// ── Chain definitions ──

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 6 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.network"] },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.testnet.arc.network" },
  },
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
      blockCreated: 1,
    },
  },
});

export const localAnvil = defineChain({
  id: 31337,
  name: "Local Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] },
  },
});

// ── Typed return types ──

export interface MarketData {
  question: string;
  category: string;
  resolutionTime: bigint;
  totalYes: bigint;
  totalNo: bigint;
  outcome: Outcome;
  resolved: boolean;
  resolver: Address;
  hederaTopicId: string;
  policyHash: string;
}

export interface PositionData {
  yesShares: bigint;
  noShares: bigint;
  claimed: boolean;
}

export interface MarketOdds {
  yesOdds: number;
  noOdds: number;
}

export interface MarketDataFormatted {
  marketId?: number;
  question: string;
  category: string;
  resolutionTime: Date;
  totalYes: string;
  totalNo: string;
  outcome: Outcome;
  resolved: boolean;
  resolver: Address;
  hederaTopicId: string;
  policyHash: string;
}

// ── Minimal ERC20 ABI ──

const ERC20_ABI = [
  {
    type: "function" as const,
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable" as const,
  },
  {
    type: "function" as const,
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view" as const,
  },
];

// ── Client factory helpers ──

export function createArcPublicClient(rpcUrl?: string): PublicClient {
  return createPublicClient({
    chain: arcTestnet,
    transport: http(rpcUrl),
  });
}

export function createArcWalletClient(privateKey: `0x${string}`, rpcUrl?: string): WalletClient {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    chain: arcTestnet,
    account,
    transport: http(rpcUrl),
  });
}

export function createLocalPublicClient(): PublicClient {
  return createPublicClient({
    chain: localAnvil,
    transport: http(),
  });
}

export function createLocalWalletClient(privateKey: `0x${string}`): WalletClient {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    chain: localAnvil,
    account,
    transport: http(),
  });
}

// ── Read functions (publicClient only) ──

export async function getMarket(
  publicClient: PublicClient,
  contractAddress: Address,
  marketId: bigint,
): Promise<MarketData> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any = await publicClient.readContract({
    address: contractAddress,
    abi: POLYAGENTS_ABI,
    functionName: "getMarket",
    args: [marketId],
  });

  return {
    question: raw.question,
    category: raw.category,
    resolutionTime: raw.resolutionTime,
    totalYes: raw.totalYes,
    totalNo: raw.totalNo,
    outcome: raw.outcome as Outcome,
    resolved: raw.resolved,
    resolver: raw.resolver,
    hederaTopicId: raw.hederaTopicId,
    policyHash: raw.policyHash,
  };
}

export async function getMarketFormatted(
  publicClient: PublicClient,
  contractAddress: Address,
  marketId: bigint,
): Promise<MarketDataFormatted> {
  const m = await getMarket(publicClient, contractAddress, marketId);
  return {
    ...m,
    resolutionTime: new Date(Number(m.resolutionTime) * 1000),
    totalYes: formatUnits(m.totalYes, 6),
    totalNo: formatUnits(m.totalNo, 6),
    marketId: Number(marketId),
  };
}

export async function getUserPosition(
  publicClient: PublicClient,
  contractAddress: Address,
  marketId: bigint,
  user: Address,
): Promise<PositionData> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any = await publicClient.readContract({
    address: contractAddress,
    abi: POLYAGENTS_ABI,
    functionName: "getUserPosition",
    args: [marketId, user],
  });

  return {
    yesShares: raw.yesShares,
    noShares: raw.noShares,
    claimed: raw.claimed,
  };
}

export async function getOdds(
  publicClient: PublicClient,
  contractAddress: Address,
  marketId: bigint,
): Promise<MarketOdds> {
  const [yesOdds, noOdds] = await publicClient.readContract({
    address: contractAddress,
    abi: POLYAGENTS_ABI,
    functionName: "getOdds",
    args: [marketId],
  }) as [bigint, bigint];

  return {
    yesOdds: Number(yesOdds),
    noOdds: Number(noOdds),
  };
}

export async function calculatePayout(
  publicClient: PublicClient,
  contractAddress: Address,
  marketId: bigint,
  user: Address,
): Promise<bigint> {
  return publicClient.readContract({
    address: contractAddress,
    abi: POLYAGENTS_ABI,
    functionName: "calculatePayout",
    args: [marketId, user],
  }) as Promise<bigint>;
}

export async function getMarketCount(
  publicClient: PublicClient,
  contractAddress: Address,
): Promise<bigint> {
  return publicClient.readContract({
    address: contractAddress,
    abi: POLYAGENTS_ABI,
    functionName: "marketCount",
    args: [],
  }) as Promise<bigint>;
}

export async function getUsdcBalance(
  publicClient: PublicClient,
  usdcAddress: Address,
  account: Address,
): Promise<bigint> {
  return publicClient.readContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account],
  }) as Promise<bigint>;
}

// ── Write functions (walletClient required) ──

export async function approveUsdc(
  walletClient: WalletClient,
  usdcAddress: Address,
  spender: Address,
  amount: bigint,
): Promise<Hash> {
  return walletClient.writeContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [spender, amount],
    account: walletClient.account!,
    chain: walletClient.chain,
  });
}

export async function createMarket(
  walletClient: WalletClient,
  publicClient: PublicClient,
  contractAddress: Address,
  opts: {
    question: string;
    category: string;
    resolutionTime: Date;
    hederaTopicId: string;
    policyHash: string;
  },
): Promise<{ marketId: bigint; txHash: Hash }> {
  const resolutionTimestamp = BigInt(Math.floor(opts.resolutionTime.getTime() / 1000));

  const txHash = await walletClient.writeContract({
    address: contractAddress,
    abi: POLYAGENTS_ABI,
    functionName: "createMarket",
    args: [
      opts.question,
      opts.category,
      resolutionTimestamp,
      opts.hederaTopicId,
      opts.policyHash,
    ],
    account: walletClient.account!,
    chain: walletClient.chain,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  // Extract marketId from MarketCreated event (topic[1] = indexed marketId)
  const log = receipt.logs.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (l: any) => l.topics && l.topics[0] === "0x7fe663b25b8155f6e2a5a90a555174a27884e4831e5e7bb1b2d16084699a4596",
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const marketId = log ? BigInt((log as any).topics[1]) : BigInt(0);

  return { marketId, txHash };
}

export async function placeBet(
  walletClient: WalletClient,
  publicClient: PublicClient,
  contractAddress: Address,
  usdcAddress: Address,
  opts: {
    marketId: bigint;
    isYes: boolean;
    amountUsdc: number; // e.g. 10 = 10 USDC
  },
): Promise<Hash> {
  const amount = parseUnits(opts.amountUsdc.toString(), 6);

  // 1. Approve USDC spend
  const approveTx = await approveUsdc(walletClient, usdcAddress, contractAddress, amount);
  await publicClient.waitForTransactionReceipt({ hash: approveTx });

  // 2. Place bet
  const txHash = await walletClient.writeContract({
    address: contractAddress,
    abi: POLYAGENTS_ABI,
    functionName: "placeBet",
    args: [opts.marketId, opts.isYes, amount],
    account: walletClient.account!,
    chain: walletClient.chain,
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

export async function resolveMarket(
  walletClient: WalletClient,
  publicClient: PublicClient,
  contractAddress: Address,
  marketId: bigint,
  outcome: Outcome,
): Promise<Hash> {
  const txHash = await walletClient.writeContract({
    address: contractAddress,
    abi: POLYAGENTS_ABI,
    functionName: "resolveMarket",
    args: [marketId, outcome],
    account: walletClient.account!,
    chain: walletClient.chain,
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

export async function claimWinnings(
  walletClient: WalletClient,
  publicClient: PublicClient,
  contractAddress: Address,
  marketId: bigint,
): Promise<Hash> {
  const txHash = await walletClient.writeContract({
    address: contractAddress,
    abi: POLYAGENTS_ABI,
    functionName: "claimWinnings",
    args: [marketId],
    account: walletClient.account!,
    chain: walletClient.chain,
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

// ── Utility ──

export function formatUsdc(amount: bigint): string {
  return formatUnits(amount, 6);
}

export function parseUsdc(amount: string | number): bigint {
  return parseUnits(amount.toString(), 6);
}

export { OUTCOME, type Outcome } from "./abi";
