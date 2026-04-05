/**
 * Arc Smoke Test — validates the full PolyAgentsMarket lifecycle locally.
 *
 * Run with:  npx tsx lib/arc/smoke-test.ts
 *
 * Requires: Anvil running on port 8545 with DeployLocal already executed.
 */

import {
  createLocalPublicClient,
  createLocalWalletClient,
  getMarketFormatted,
  getOdds,
  getUserPosition,
  calculatePayout,
  getMarketCount,
  getUsdcBalance,
  createMarket,
  placeBet,
  resolveMarket,
  claimWinnings,
  formatUsdc,
  OUTCOME,
  type MarketDataFormatted,
} from "./market-client";
import type { Address } from "viem";

// ── Addresses from DeployLocal ──

// NOTE: These addresses change on each redeploy. Read from broadcast/run-latest.json.
const USDC = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address;
const MARKET = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0" as Address;
const DEPLOYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;
const TEST_USER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;

const log = (msg: string) => console.log(`  ${msg}`);
const ok = (msg: string) => console.log(`  ${msg}`);
const fail = (msg: string) => { console.error(`  FAIL: ${msg}`); process.exit(1); };

let passed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
    ok(`PASS: ${msg}`);
  } else {
    fail(msg);
  }
}

async function main() {
  console.log("\n=== Arc Smoke Test ===\n");

  const publicClient = createLocalPublicClient();
  const walletClient = createLocalWalletClient(DEPLOYER_KEY);
  const deployerAddress = walletClient.account!.address;

  // ── 1. Check pre-deployment state ──

  console.log("1. Pre-deployment checks");

  const deployerBalance = await getUsdcBalance(publicClient, USDC, deployerAddress);
  log(`Deployer USDC balance: ${formatUsdc(deployerBalance)}`);
  assert(deployerBalance > BigInt(0), "Deployer has USDC");

  const testUserBalance = await getUsdcBalance(publicClient, USDC, TEST_USER);
  log(`Test user USDC balance: ${formatUsdc(testUserBalance)}`);
  assert(testUserBalance > BigInt(0), "Test user has USDC");

  const initialMarketCount = await getMarketCount(publicClient, MARKET);
  log(`Market count: ${initialMarketCount}`);

  // ── 2. Create a market ──

  console.log("\n2. Create prediction market");

  const resolutionTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
  const { marketId, txHash: createTx } = await createMarket(walletClient, publicClient, MARKET, {
    question: "Will BTC close above $100k this week?",
    category: "crypto",
    resolutionTime,
    hederaTopicId: "0.0.123456",
    policyHash: "0x" + "ab".repeat(32),
  });

  log(`Market #${marketId} created`);
  log(`TX: ${createTx}`);
  assert(marketId > BigInt(0), "Market ID is valid");

  const newCount = await getMarketCount(publicClient, MARKET);
  assert(newCount === initialMarketCount + BigInt(1), "Market count incremented");

  // ── 3. Read market data ──

  console.log("\n3. Read market data");

  const market = await getMarketFormatted(publicClient, MARKET, marketId);
  log(`Question: ${market.question}`);
  log(`Category: ${market.category}`);
  log(`Resolved: ${market.resolved}`);
  log(`Total YES: ${market.totalYes} USDC`);
  log(`Total NO: ${market.totalNo} USDC`);
  log(`Resolver: ${market.resolver}`);
  assert(market.question === "Will BTC close above $100k this week?", "Question matches");
  assert(market.category === "crypto", "Category matches");
  assert(!market.resolved, "Market is not resolved yet");

  // ── 4. Check odds (should be 50/50 with no bets) ──

  console.log("\n4. Check odds");

  const odds = await getOdds(publicClient, MARKET, marketId);
  log(`YES: ${(odds.yesOdds / 100).toFixed(1)}%  |  NO: ${(odds.noOdds / 100).toFixed(1)}%`);
  assert(odds.yesOdds === 5000 && odds.noOdds === 5000, "Odds are 50/50 with no bets");

  // ── 5. Place bets ──

  console.log("\n5. Place bets");

  const betTx1 = await placeBet(walletClient, publicClient, MARKET, USDC, {
    marketId,
    isYes: true,
    amountUsdc: 10,
  });
  log(`Deployer bet YES 10 USDC: ${betTx1}`);

  // Use test user for NO bet
  const testWallet = createLocalWalletClient("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as `0x${string}`);
  const betTx2 = await placeBet(testWallet, publicClient, MARKET, USDC, {
    marketId,
    isYes: false,
    amountUsdc: 5,
  });
  log(`Test user bet NO 5 USDC: ${betTx2}`);

  // ── 6. Check updated state ──

  console.log("\n6. Check updated state");

  const updatedMarket = await getMarketFormatted(publicClient, MARKET, marketId);
  log(`Total YES: ${updatedMarket.totalYes} USDC`);
  log(`Total NO: ${updatedMarket.totalNo} USDC`);
  assert(updatedMarket.totalYes === "10", "YES total is 10 USDC");
  assert(updatedMarket.totalNo === "5", "NO total is 5 USDC");

  const updatedOdds = await getOdds(publicClient, MARKET, marketId);
  log(`YES: ${(updatedOdds.yesOdds / 100).toFixed(1)}%  |  NO: ${(updatedOdds.noOdds / 100).toFixed(1)}%`);
  assert(updatedOdds.yesOdds === 6666, "YES odds ~66.7%");
  assert(updatedOdds.noOdds === 3334, "NO odds ~33.3%");

  const pos = await getUserPosition(publicClient, MARKET, marketId, deployerAddress);
  log(`Deployer position: YES=${pos.yesShares} NO=${pos.noShares} claimed=${pos.claimed}`);
  assert(pos.yesShares === BigInt(10_000_000), "Deployer has 10 USDC YES shares");
  assert(!pos.claimed, "Not yet claimed");

  // ── 7. Advance time & resolve market ──

  console.log("\n7. Advance time & resolve market");

  // Mine blocks to advance past resolution time
  const secondsToAdvance = Math.ceil((resolutionTime.getTime() - Date.now()) / 1000) + 100;
  // Use anvil's evm_increaseTime
  const timeRes = await fetch("http://127.0.0.1:8545", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "evm_increaseTime",
      params: [secondsToAdvance],
      id: 2,
    }),
  });
  const timeJson = await timeRes.json();
  log(`Advanced time by ${secondsToAdvance}s`);

  // Mine a block
  await fetch("http://127.0.0.1:8545", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "evm_mine", params: [], id: 3 }),
  });

  const resolveTx = await resolveMarket(walletClient, publicClient, MARKET, marketId, OUTCOME.YES);
  log(`Market resolved as YES: ${resolveTx}`);

  const resolvedMarket = await getMarketFormatted(publicClient, MARKET, marketId);
  assert(resolvedMarket.resolved, "Market is now resolved");
  log(`Outcome: ${resolvedMarket.outcome}`);

  // ── 8. Check payout & claim ──

  console.log("\n8. Claim winnings");

  const payout = await calculatePayout(publicClient, MARKET, marketId, deployerAddress);
  log(`Expected payout: ${formatUsdc(payout)} USDC (before 0.5% fee)`);
  assert(payout > BigInt(0), "Payout > 0");

  const balanceBefore = await getUsdcBalance(publicClient, USDC, deployerAddress);
  log(`Balance before claim: ${formatUsdc(balanceBefore)} USDC`);

  const claimTx = await claimWinnings(walletClient, publicClient, MARKET, marketId);
  log(`Claim TX: ${claimTx}`);

  const balanceAfter = await getUsdcBalance(publicClient, USDC, deployerAddress);
  log(`Balance after claim: ${formatUsdc(balanceAfter)} USDC`);
  assert(balanceAfter > balanceBefore, "Balance increased after claim");

  const claimedPos = await getUserPosition(publicClient, MARKET, marketId, deployerAddress);
  assert(claimedPos.claimed, "Position marked as claimed");

  // ── Summary ──

  console.log("\n=== RESULTS ===");
  console.log(`  ${passed}/${passed} tests passed`);
  console.log(`  Market #${marketId} created and fully exercised`);
  console.log(`  Full lifecycle: create -> bet -> resolve -> claim\n`);
}

main().catch((err) => {
  console.error("\n  FATAL:", err);
  process.exit(1);
});
