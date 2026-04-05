# ETHGlobal Cannes 2026 — Prize Track Submissions

---

## Arc — Best Prediction Markets Built on Arc with Real-World Signal ($3,000)

### How are you using this Protocol / API?

PolyAgents uses Arc as the USDC-native settlement layer for its AI-powered prediction market vault. The PolyAgentsMarket smart contract (Solidity, deployed on Arc Testnet, Chain ID 5042002) implements binary YES/NO markets with USDC as both the gas token and betting currency. The full contract lifecycle is implemented end-to-end: `createMarket` creates markets with BTC 5-minute price signals and Hedera HCS topic IDs for cross-chain audit, `placeBet` handles USDC-denominated bets (with automatic ERC-20 approve before each bet), `resolveMarket` settles markets against actual outcomes (YES/NO/VOIDED), and `claimWinnings` pays out with a 0.5% protocol fee. The vault dashboard (`app/vault/[id]/page.tsx`) displays live on-chain data via `syncVaultFromChain` — a server action that parallel-fetches the user's USDC balance, total market count, all market questions with YES/NO USDC totals, live odds percentages, and user positions (YES/NO share counts and claimed status). The market browser page (`app/vault/[id]/markets/page.tsx`) is wired to live Arc data through Next.js server actions (`fetchAllMarkets`, `createPredictionMarket`, `placeBetOnMarket`, `resolvePredictionMarket`, `claimMarketWinnings`). Users fund vaults with USDC on Arc via a Privy wallet integration (`lib/arc/privy-wallet.ts`) — the user signs USDC approve and bet transactions client-side through their Privy embedded wallet, with a viem WalletClient backed by Privy's EIP-1193 provider. The system supports both Arc Testnet (via RPC) and local Anvil for development. Arc's deterministic finality (~2s) and native USDC gas eliminate ETH-volatility friction — every fee, bet, and payout is in stable dollars.

**Target bounty:** Best Prediction Markets Built on Arc with Real-World Signal — $3,000

### Link to the line of code where the tech is used

- Smart contract: `contracts/src/PolyAgentsMarket.sol` — createMarket, placeBet, resolveMarket, claimWinnings, getOdds, getUserPosition, calculatePayout
- TypeScript client: `lib/arc/market-client.ts` — viem-based full client (getMarket, getMarketFormatted, getUserPosition, getOdds, calculatePayout, getMarketCount, getUsdcBalance, createMarket, placeBet, resolveMarket, claimWinnings, approveUsdc)
- Contract ABI: `lib/arc/abi.ts` — typed POLYAGENTS_ABI with Outcome enum and function signatures
- Arc chain config: `lib/arc/market-client.ts:26-45` (arcTestnet Chain ID 5042002 + localAnvil Chain ID 31337)
- Privy wallet bridge: `lib/arc/privy-wallet.ts` — getPrivyArcWalletClient, getArcPublicClient, approveUsdcFromPrivy, readUsdcBalance
- Server actions: `actions/arc/markets.ts` — fetchAllMarkets, fetchMarket, fetchMarketCount, fetchOdds, fetchUserPosition, fetchPayout, createPredictionMarket, placeBetOnMarket, resolvePredictionMarket, claimMarketWinnings
- Server action: `actions/arc/fund-vault.ts` — fetchUsdcBalance (real-time USDC balance display on vault creation)
- Server action: `actions/arc/sync-vault.ts` — syncVaultFromChain (parallel balance + market count fetch, iterates all markets with odds + positions)
- Frontend vault dashboard: `app/vault/[id]/page.tsx` — displays synced on-chain USDC balance, Arc markets with odds/positions
- Frontend market browser: `app/vault/[id]/markets/page.tsx` — live market creation and betting via server actions
- Frontend arc-test panel: `app/arc-test/page.tsx`

### How easy is it to use the API / Protocol? (1 - very difficult, 10 - very easy)

8 — Arc is standard EVM, so Foundry/Hardhat deploy and viem/ethers interaction work out of the box. The main UX win is USDC as gas token — no need to manage ETH for fees. The testnet faucet and explorer are straightforward. Would be a 9 with better-documented Circle API examples for FX and EURC.

### Additional feedback for the Sponsor

USDC as the native gas token is a genuinely better UX than ETH-denominated gas for prediction markets — users immediately understand "$0.01 in gas" vs "0.00004 ETH in gas." The deterministic finality is a major advantage for high-frequency markets like ours (5-minute windows). One suggestion: a lightweight JS SDK for common prediction market patterns (create/resolve/claim) would significantly reduce boilerplate. The testnet faucet experience was smooth.

---

## Arc — Best Chain Abstracted USDC Apps Using Arc as a Liquidity Hub ($3,000)

### How are you using this Protocol / API?

PolyAgents treats Arc and Polygon as a single unified liquidity surface for USDC, using Circle CCTP (via `@circle-fin/app-kit` and `@circle-fin/adapter-viem-v2`) to automatically bridge capital between chains with zero user intervention. Arc serves as the vault's home chain — users fund vaults with USDC on Arc, positions are mirrored and settled on the PolyAgentsMarket contract, and profits are repatriated back to Arc. Polygon serves as the execution venue — Polymarket's CLOB lives on Polygon, so the agent needs USDC liquidity there to place bets. The cross-chain flow is fully automated inside the 13-step trading cycle: Step 5 (`ensurePolygonLiquidity`) detects when the Polygon USDC balance is below the threshold and bridges $5.00 USDC chunks from Arc to Polygon via CCTP before placing bets. Step 9 (`mirrorBetToArc`) replicates filled Polygon bets onto the Arc contract for on-chain settlement. Step 12 (`repatriateProfitsToArc`) bridges accumulated trading profits from Polygon back to Arc for vault settlement. A Vercel cron endpoint (`app/api/engine/cron/repatriate/route.ts`) runs periodically to repatriate profits even when the agent is idle. The user never sees chain switching, never signs cross-chain transactions, and never manages separate balances — from their perspective, they fund a vault on Arc with USDC and the system handles the rest. The Circle AppKit (`new AppKit().bridge()`) handles the CCTP transfer with source/destination adapters for both Arc Testnet and Polygon.

**Target bounty:** Best Chain Abstracted USDC Apps Using Arc as a Liquidity Hub — $3,000

### Link to the line of code where the tech is used

- Arc → Polygon bridge (ensure liquidity): `actions/engine/steps/ensure-polygon-liquidity.ts` — bridgeUsdcToPolygon (CCTP via Circle AppKit, $5.00 chunks)
- Polygon → Arc bridge (repatriate): `actions/engine/steps/ensure-polygon-liquidity.ts:83-127` — repatriateProfitsToArc
- Cron repatriation endpoint: `app/api/engine/cron/repatriate/route.ts` — periodic Polygon→Arc USDC bridging for active vaults
- Bet mirroring: `actions/engine/steps/mirror-arc.ts` — mirrorBetToArc (creates market + places bet on Arc contract from Polygon fill data)
- Circle packages: `package.json:13-14` — @circle-fin/adapter-viem-v2, @circle-fin/app-kit
- Trading cycle orchestration: `actions/engine/workflows/trading-cycle.ts:91-99` (step 5: ensure liquidity), `actions/engine/workflows/trading-cycle.ts:116-121` (step 9: mirror), `actions/engine/workflows/trading-cycle.ts:138-148` (step 12: repatriate)
- Arc contract settlement: `lib/arc/market-client.ts` — createMarket, placeBet, resolveMarket, claimWinnings
- Privy wallet (user-side): `lib/arc/privy-wallet.ts` — getPrivyArcWalletClient, getArcPublicClient, readUsdcBalance

### How easy is it to use the API / Protocol? (1 - very difficult, 10 - very easy)

7 — Circle's AppKit API is clean (`new AppKit().bridge()` with source/destination/amount/token), and the viem adapter integration is well-designed. The main friction is documentation — the Bridge Kit and AppKit docs are fragmented across multiple Circle developer pages, and there are few end-to-end TypeScript examples for CCTP bridging. The `as any` casts needed on the bridge call suggest the TypeScript types could be tighter. Testnet-to-testnet bridging worked reliably once configured.

### Additional feedback for the Sponsor

CCTP bridging is the right abstraction for cross-chain USDC movement — no wrapped tokens, no liquidity pool slippage, just native USDC on both sides. The AppKit's ability to handle the full burn-mint-attest cycle in a single `bridge()` call is excellent. Two suggestions: (1) a unified "CrossChainWallet" abstraction that holds balances on multiple chains and auto-bridges as needed would be a game-changer for apps like ours, and (2) real-time status callbacks or webhooks for bridge transfers would help with the async nature of CCTP (currently we poll or use non-blocking calls). The $5.00 minimum practical transfer size is fine for our use case but could be documented more prominently.

---

## Arc — Best Agentic Economy with Nanopayments ($6,000)

### How are you using this Protocol / API?

PolyAgents demonstrates an autonomous AI agent that makes USDC-denominated payments across chains without human intervention — the agent funds its own operations, moves capital between networks, and settles positions using Circle CCTP on Arc. The core agentic payment flow: (1) The agent detects it needs trading capital on Polygon, (2) it autonomously bridges USDC from Arc to Polygon via Circle CCTP (`ensurePolygonLiquidity` — $5.00 per bridge call), (3) it places bets on Polymarket using that capital, (4) it mirrors filled positions to the Arc contract for settlement, and (5) it autonomously repatriates profits back to Arc. This is a complete autonomous financial loop — the agent sources capital (Arc), routes it to where it's needed (Polygon), executes trades, and settles proceeds — all in USDC, all without human approval. The agent also makes proportional HBAR micropayments on Hedera for each LLM inference call (before each trading decision), creating a dual-chain payment pattern: USDC for capital movement on Arc, HBAR for compute payments on Hedera. On Arc specifically, every contract interaction (market creation, bet placement, resolution, claim) is gas-funded in USDC — the agent is continuously spending USDC on Arc for gas as part of its autonomous operation cycle. The Vercel cron endpoint (`app/api/engine/cron/repatriate/route.ts`) runs without human triggers, scanning active vaults and bridging profits autonomously. The entire 13-step pipeline runs as a server-side orchestrator — the agent decides when to bridge, how much to bridge, and when to repatriate, all based on its AI analysis and risk parameters.

**Target bounty:** Best Agentic Economy with Nanopayments — $6,000

### Link to the line of code where the tech is used

- Autonomous Arc→Polygon bridge: `actions/engine/steps/ensure-polygon-liquidity.ts:26-75` — agent detects low Polygon balance and bridges USDC via CCTP
- Autonomous Polygon→Arc repatriation: `actions/engine/steps/ensure-polygon-liquidity.ts:83-127` — agent bridges profits back to Arc
- Cron repatriation (unattended): `app/api/engine/cron/repatriate/route.ts` — periodic autonomous profit bridging
- AI-driven bridge decision: `actions/engine/workflows/trading-cycle.ts:91-99` — step 5 decides whether to bridge based on AI analysis
- Position mirroring to Arc: `actions/engine/steps/mirror-arc.ts` — autonomous Arc contract settlement
- Arc USDC gas payments: `contracts/src/PolyAgentsMarket.sol` — all contract calls gas-funded in USDC
- Circle AppKit bridge: `actions/engine/steps/ensure-polygon-liquidity.ts:39-69` — CCTP via @circle-fin/app-kit
- Circle packages: `package.json:13-14` — @circle-fin/adapter-viem-v2, @circle-fin/app-kit
- Server-side orchestrator: `actions/engine/workflows/trading-cycle.ts` — 13-step autonomous pipeline
- Vault funding: `lib/arc/privy-wallet.ts` — user-side USDC funding via Privy embedded wallet

### How easy is it to use the API / Protocol? (1 - very difficult, 10 - very easy)

7 — Circle's Bridge Kit and AppKit make CCTP bridging approachable — the `bridge()` call with source/destination adapters is intuitive. However, building a fully autonomous agent payment loop requires significant glue code: balance checking across chains, threshold detection, async bridge handling, and retry logic. The nanopayments concept (gas-free micropayments on Arc) is compelling but the documentation for programmatic agent-to-agent USDC flows is still emerging. The viem adapter works well for integration with existing web3 tooling.

### Additional feedback for the Sponsor

The concept of an AI agent autonomously managing its own USDC treasury across chains is powerful — Arc's USDC-as-gas model means the agent doesn't need a separate ETH balance to operate. Our agent bridges $5.00 at a time, which is practical for our $0.01-per-bet strategy but would benefit from lower minimums for true nanopayment-scale agent commerce. Two suggestions: (1) a "Gas Sponsorship" API where an agent can pay for another agent's gas in USDC (enabling true agent-to-agent Arc payments), and (2) a streaming CCTP mode for continuous small transfers rather than discrete bridge calls. The deterministic finality on Arc gives the agent confidence that its capital movements are settled before acting on them.

---

## ENS — Most Creative Use ($2,500)

### How are you using this Protocol / API?

PolyAgents uses ENS as a cryptographic commitment and public identity layer for autonomous trading agents — going far beyond simple name resolution. When a vault is created, the strategy parameters are hashed via `keccak256(strategyJSON)` and the resulting commitment hash is written as a `policy.commitment` text record on a vault subname (e.g., `vault-abc.polyagents.eth`) via `setText` on Sepolia. This creates a verifiable on-chain guarantee: anyone can confirm the agent is following its original declared strategy by comparing the on-chain hash against the current strategy, without the actual strategy parameters ever being public. Additionally, live agent statistics (flips executed, PnL, inventory counts, trading mode, last trade timestamp, engine state) are written as individual text records (`agent.flips`, `agent.pnl`, `agent.inventory`, `agent.mode`, `agent.lastTrade`, `agent.engineState`), turning the vault's ENS name into a real-time public identity card readable by any ENS-aware tool. Agent identity is registered via ENSIP-25 — `agent-registration[hedera-hcs14][{topicId}]` text records link the ENS name to the vault's HCS-14 on-chain agent identity. Agent capabilities (market-analysis, bid-placement, risk-management, pnl-reconciliation) and metadata (type, name, version, network, status) are stored under the `ai.agent.*` namespace. The full ENS initialization (subname creation + policy hash commit + agent stats + ENSIP-25 registration + fleet registry) is orchestrated in `lib/ens/vault-ens-init.ts` and executed as part of the vault deployment sequence. The ENSVerificationCard component on the dashboard reads live stats, verifies policy integrity, and displays the agent profile — with error handling for subnames not yet initialized and a retry button.

**Target bounty:** ENS — Most Creative Use — $2,500

### Link to the line of code where the tech is used

- Policy hash commitment: `lib/ens/policy-commitment.ts` — computePolicyHash (keccak256), commitPolicyHash, verifyPolicyIntegrity
- Live agent stats: `lib/ens/agent-stats.ts` — updateAgentStats, readAgentStats (7 stat keys)
- Subname creation + text record R/W: `lib/ens/subname.ts` — createVaultSubname, readTextRecord, setTextRecord, batchSetTextRecords
- Agent identity (ENSIP-25): `lib/ens/agent-identity.ts` — registerAgentENSIP25, verifyAgentIdentity, resolveAgentProfile
- Vault metadata: `lib/ens/vault-metadata.ts` — writeVaultMetadata
- Fleet registry: `lib/ens/fleet-registry.ts` — registerAgentInFleet, getFleetAgents, updateFleetAgentStatus
- Full init orchestrator: `lib/ens/vault-ens-init.ts` — initVaultENS
- ENS client (Sepolia): `lib/ens/client.ts` — ensPublicClient, ensWalletClient, fallback RPCs
- Frontend verification card: `components/ens-verification-card.tsx` — policy verification, live stats, agent profile, error/empty states
- Frontend policy page: `app/vault/[id]/policy/page.tsx` — hash preview, save/commit flow
- Frontend dashboard: `app/vault/[id]/page.tsx` — ENS name display with link to ENS explorer

### How easy is it to use the API / Protocol? (1 - very difficult, 10 - very easy)

9 — viem's ENS support (namehash, labelhash, setText, text) makes text record reads and writes clean and type-safe. The pattern of writing arbitrary key-value data via text records is elegant and well-documented. The only friction is managing subname creation (setSubnodeOwner + setResolver) which requires two transactions.

### Additional feedback for the Sponsor

Text records as a general-purpose key-value store is an underappreciated ENS feature. Our use case — cryptographic commitment schemes for autonomous agents — is a pattern that could generalize to any AI agent system that needs public verifiability. A helper library or standard (like ERC-??? for agent commitments on ENS) could formalize this. Also, batched text record writes (multiple keys in one tx) would significantly reduce gas for our agent stats updates.

---

## Hedera — No Solidity ($1,000) + AI & Agentic Payments ($3,000)

### How are you using this Protocol / API?

PolyAgents integrates Hedera across five services with zero Solidity — pure `@hashgraph/sdk` TypeScript. Each vault gets a custom HTS fungible token with a 0.0001 HBAR custom fee per transfer, and non-transferable operator tokens gate access to auto-trading mode, all created via `TokenCreateTransaction` and `TokenMintTransaction`. Every agent decision is immutably logged to a per-vault HCS topic (events include VAULT_INITIALIZED, LLM_CALL_AUTHORIZED, TRADE_ANALYZED, TRADE_EXECUTED, RISK_CHECK, PAYMENT_MADE, SCHEDULE_CREATED), with the full audit trail publicly queryable via the Mirror Node REST API (`getAuditLogs`, `getTokenInfo`, `getScheduleInfo`, `getAccountBalance`). Before each LLM call, the agent pays HBAR proportional to the actual token usage of the previous inference (input/output token counts converted to HBAR at a $0.25/HBAR reference rate, minimum 0.00001 HBAR) via `TransferTransaction` — this is the core AI & Agentic Payments use case: an autonomous agent making verifiable micropayments without human intervention (up to 48 payments/hour in auto mode), each logged to HCS with txId, amount, and consensus timestamp. The agent also registers an on-chain identity via HCS-14 with a Unified Agent ID (UAID: `hcs14:hedera:testnet:{topicId}`), declaring capabilities like market-analysis, risk-assessment, trade-execution, and inventory-management on a dedicated HCS topic. Finally, scheduled transactions via `ScheduleCreateTransaction` enable future-dated vault rebalancing operations. The full Hedera initialization is orchestrated in `lib/hedera/vault-init.ts` (token + topic + identity + schedule) and runs as part of the vault deployment sequence. On the frontend, the audit trail page (`app/vault/[id]/audit/page.tsx`) shows both local events and live HCS messages from Mirror Node, the token page (`app/vault/[id]/token/page.tsx`) displays HTS token info and gate status, and the agent control panel (`app/vault/[id]/agent/page.tsx`) shows HBAR reserve gauge, payment history, and HCS-14 UAID.

**Target bounties:** Hedera No Solidity — $1,000 + Hedera AI & Agentic Payments — $3,000 = $4,000 total

### Link to the line of code where the tech is used

- HTS vault token creation + custom fees: `lib/hedera/hts-vault.ts` — createVaultToken, mintVaultShares
- HCS audit topic + logging: `lib/hedera/hcs-logger.ts` — createVaultAuditTopic, logToHCS, setActiveTopic
- HBAR autonomous agent payments: `lib/hedera/agent-payment.ts` — payForLLMCall (proportional to LLM token usage, logged to HCS)
- HCS-14 agent identity (UAID): `lib/hedera/agent-identity.ts` — registerHCS14Identity
- Scheduled transactions: `lib/hedera/scheduler.ts` — scheduleVaultOperation, getScheduleStatus
- Mirror Node audit queries: `lib/hedera/mirror-node.ts` — getAuditLogs, getTokenInfo, getScheduleInfo, getAccountBalance
- Full vault orchestrator: `lib/hedera/vault-init.ts` — initHederaVault (token + topic + identity + schedule)
- Hedera SDK client: `lib/hedera/client.ts` — testnet client with operator credentials
- Frontend audit trail page: `app/vault/[id]/audit/page.tsx` — local + HCS tabs, Mirror Node queries
- Frontend HTS token gate page: `app/vault/[id]/token/page.tsx` — token card, gate status, NFT holdings
- Frontend agent control panel: `app/vault/[id]/agent/page.tsx` — HBAR gauge, payments, HCS-14 UAID, cycle log

### How easy is it to use the API / Protocol? (1 - very difficult, 10 - very easy)

8 — The Hedera SDK is well-structured with clear transaction builders. HTS token creation with custom fees took ~15 lines of meaningful code. HCS messaging is straightforward. HCS-14 identity registration is implemented directly with `@hashgraph/sdk` consensus message submissions. The main friction: the SDK's builder pattern is verbose (freezeWith + sign for every transaction), and the portal.hedera.com testnet setup requires manual steps. Mirror Node REST API is clean and well-documented.

### Additional feedback for the Sponsor

The combination of HTS + HCS + scheduled transactions is uniquely powerful for autonomous agents — no other chain offers this combination natively without Solidity. HCS-14 agent identity is an excellent differentiator that deserves more visibility in the docs. Two suggestions: (1) a higher-level JS helper that bundles `freezeWith + sign + execute + getReceipt` into a single call would reduce boilerplate significantly, and (2) first-class HCS-14 examples in the main SDK documentation (not just the standalone spec) would help adoption. The free testnet HBAR provisioning via the portal is a great developer experience.
