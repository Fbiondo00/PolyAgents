# ETHGlobal Cannes 2026 — Prize Track Submissions

---

## Arc — Best Prediction Markets Built on Arc with Real-World Signal ($3,000)

### How are you using this Protocol / API?

PolyAgents uses Arc as the USDC-native settlement layer for its AI-powered prediction market vault. The VaultPilotMarket smart contract (Solidity, deployed on Arc Testnet) implements binary YES/NO markets with USDC as both the gas token and betting currency. An autonomous AI agent creates markets based on real-world BTC price signals (5-minute windows), places USDC-denominated bets via passive market-making ($0.01 bids, flipped at $0.02), and resolves markets against actual price outcomes. Arc's deterministic finality (~2s) and native USDC gas eliminate ETH-volatility friction — every fee, bet, and payout is in stable dollars, making the economics predictable for both the agent and end users. The contract includes a 0.5% protocol fee, minimum 1 USDC bet, and integrates with Hedera HCS for immutable audit logging of every market creation and resolution.

**Target bounty:** Best Prediction Markets Built on Arc with Real-World Signal — $3,000

### Link to the line of code where the tech is used

- Smart contract: `docs/sponsors/arc.md:40-54` — VaultPilotMarket.sol (createMarket, placeBet, resolveMarket, claimWinnings)
- TypeScript client: `docs/sponsors/arc.md:68-79` — viem-based Arc integration (createPredictionMarket, placeBet, resolveMarket, getMarketData)
- Arc chain config (Arc Testnet, Chain ID 1120, USDC gas): `docs/sponsors/arc.md:7-19`
- Frontend vault dashboard showing USDC funding: `app/vault/[id]/page.tsx`
- Frontend market browser with order book: `app/vault/[id]/markets/page.tsx`

### How easy is it to use the API / Protocol? (1 - very difficult, 10 - very easy)

8 — Arc is standard EVM, so Foundry/Hardhat deploy and viem/ethers interaction work out of the box. The main UX win is USDC as gas token — no need to manage ETH for fees. The testnet faucet and explorer are straightforward. Would be a 9 with better-documented Circle API examples for FX and EURC.

### Additional feedback for the Sponsor

USDC as the native gas token is a genuinely better UX than ETH-denominated gas for prediction markets — users immediately understand "$0.01 in gas" vs "0.00004 ETH in gas." The deterministic finality is a major advantage for high-frequency markets like ours (5-minute windows). One suggestion: a lightweight JS SDK for common prediction market patterns (create/resolve/claim) would significantly reduce boilerplate. The testnet faucet experience was smooth.

---

## ENS — Most Creative Use ($2,500)

### How are you using this Protocol / API?

PolyAgents uses ENS as a cryptographic commitment and public identity layer for autonomous trading agents — going far beyond simple name resolution. When a vault is created, the strategy parameters are hashed via `keccak256(strategyJSON)` and the resulting commitment hash is written as a `policy.commitment` text record on a vault subname (e.g., `vault-abc.vaultpilot.eth`). This creates a verifiable on-chain guarantee: anyone can confirm the agent is following its original declared strategy by comparing the on-chain hash against the current strategy, without the actual strategy parameters ever being public. Additionally, live agent statistics (flips executed, PnL, inventory counts, trading mode, last trade timestamp) are written as individual text records (`agent.flips`, `agent.pnl`, `agent.inventory`, `agent.mode`, `agent.lastTrade`), turning the vault's ENS name into a real-time public identity card readable by any ENS-aware tool. This is a novel pattern: ENS as a public verification layer for autonomous AI agents.

**Target bounty:** ENS — Most Creative Use — $2,500

### Link to the line of code where the tech is used

- Policy hash commitment (keccak256 + setText): `docs/sponsors/ens.md:54-126` — `src/ens/policy-commitment.ts`
- Live agent stats as text records: `docs/sponsors/ens.md:134-237` — `src/ens/agent-stats.ts`
- Subname creation under vaultpilot.eth: `docs/sponsors/ens.md:243-308` — `src/ens/subname.ts`
- Full vault ENS initialization flow: `docs/sponsors/ens.md:314-351` — `src/ens/vault-ens-init.ts`
- Frontend policy hash display: `app/vault/[id]/policy/page.tsx`

### How easy is it to use the API / Protocol? (1 - very difficult, 10 - very easy)

9 — viem's ENS support (namehash, labelhash, setText, text) makes text record reads and writes clean and type-safe. The pattern of writing arbitrary key-value data via text records is elegant and well-documented. The only friction is managing subname creation (setSubnodeOwner + setResolver) which requires two transactions.

### Additional feedback for the Sponsor

Text records as a general-purpose key-value store is an underappreciated ENS feature. Our use case — cryptographic commitment schemes for autonomous agents — is a pattern that could generalize to any AI agent system that needs public verifiability. A helper library or standard (like ERC-??? for agent commitments on ENS) could formalize this. Also, batched text record writes (multiple keys in one tx) would significantly reduce gas for our agent stats updates.

---

## Hedera — No Solidity ($1,000) + AI & Agentic Payments ($3,000)

### How are you using this Protocol / API?

PolyAgents integrates Hedera across five services with zero Solidity — pure `@hashgraph/sdk` TypeScript. Each vault gets a custom HTS fungible token with a 0.0001 HBAR custom fee per transfer, and non-transferable operator tokens gate access to auto-trading mode, all created via `TokenCreateTransaction` and `TokenMintTransaction`. Every agent decision is immutably logged to a per-vault HCS topic (events include VAULT_INITIALIZED, LLM_CALL_AUTHORIZED, TRADE_ANALYZED, TRADE_EXECUTED, RISK_CHECK, PAYMENT_MADE, SCHEDULE_CREATED), with the full audit trail publicly queryable via the Mirror Node REST API. Before each LLM call, the agent pays 0.001 HBAR via `TransferTransaction` — this is the core AI & Agentic Payments use case: an autonomous agent making verifiable micropayments without human intervention (up to 48 payments/hour in auto mode), each logged to HCS with txId, amount, and consensus timestamp. The agent also registers an on-chain identity via HCS-14 with a Unified Agent ID (UAID: `hcs14:hedera:testnet:{topicId}`), declaring capabilities like market-analysis, risk-assessment, trade-execution, and inventory-management on a dedicated HCS topic. Finally, scheduled transactions via `ScheduleCreateTransaction` enable future-dated vault rebalancing operations.

**Target bounties:** Hedera No Solidity — $1,000 + Hedera AI & Agentic Payments — $3,000 = $4,000 total

### Link to the line of code where the tech is used

- HTS vault token creation + custom fees: `docs/sponsors/hedera.md:21-24` — `src/hedera/hts-vault.ts`
- HCS audit topic + logging: `docs/sponsors/hedera.md:27-31` — `src/hedera/hcs-logger.ts`
- HBAR autonomous agent payments: `docs/sponsors/hedera.md:35-37` — `src/hedera/agent-payment.ts`
- HCS-14 agent identity (UAID): `docs/sponsors/hedera.md:43-46` — `src/hedera/agent-identity.ts`
- Scheduled transactions: `docs/sponsors/hedera.md:50-51` — `src/hedera/scheduler.ts`
- Mirror Node audit queries: `docs/sponsors/hedera.md:55-58` — `src/hedera/mirror-node.ts`
- Full vault orchestrator (all services): `docs/sponsors/hedera.md:62-63` — `src/hedera/vault-init.ts`
- Frontend audit trail page: `app/vault/[id]/audit/page.tsx`
- Frontend HTS token gate page: `app/vault/[id]/token/page.tsx`
- Frontend agent control panel: `app/vault/[id]/agent/page.tsx`

### How easy is it to use the API / Protocol? (1 - very difficult, 10 - very easy)

8 — The Hedera SDK is well-structured with clear transaction builders. HTS token creation with custom fees took ~15 lines of meaningful code. HCS messaging is straightforward. The `hedera-agent-kit` simplifies HCS-14 identity registration. The main friction: the SDK's builder pattern is verbose (freezeWith + sign for every transaction), and the portal.hedera.com testnet setup requires manual steps. Mirror Node REST API is clean and well-documented.

### Additional feedback for the Sponsor

The combination of HTS + HCS + scheduled transactions is uniquely powerful for autonomous agents — no other chain offers this combination natively without Solidity. HCS-14 agent identity is an excellent differentiator that deserves more visibility in the docs. Two suggestions: (1) a higher-level JS helper that bundles `freezeWith + sign + execute + getReceipt` into a single call would reduce boilerplate significantly, and (2) the hedera-agent-kit should include first-class HCS-14 examples beyond what's currently documented. The free testnet HBAR provisioning via the portal is a great developer experience.
