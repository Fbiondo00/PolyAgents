Short description *
A max 100-character or less description of your project (it should fit in a tweet!)

AI autonomous vault trading Polymarket BTC 5-min markets via Arc, Hedera HCS, and ENS identity.

Description *
Go in as much detail as you can about what this project is. Please be as clear as possible! (min 280 characters)

PolyAgents is an AI-powered autonomous trading vault that trades Polymarket BTC "Up or Down" 5-minute binary markets using a passive market-making strategy. The agent places limit bids on both YES and NO sides and captures the spread when fills occur — all driven by AI direction analysis from Gemini 2.0 Flash Lite via the Vercel AI Gateway.

The system runs a continuous 13-step trading cycle every 5 seconds: discover the active BTC 5-min market from Polymarket's Gamma API, get an AI trade decision (direction, confidence, reasoning), place simulated or real limit orders, detect fills via a deterministic fill simulator against real order book data, sell coverage for held inventory, calculate PnL, and log every step to Hedera Consensus Service (HCS) for full on-chain auditability.

Users create vaults through a 5-step wizard, fund them with USDC on Arc Testnet, and toggle between advisory mode (human confirms each cycle) and auto mode (agent acts autonomously). Every AI decision and engine step is immutably logged to HCS, with HBAR micropayments fired per cycle to pay for LLM inference — demonstrating autonomous agent-to-agent payments on Hedera. Vault strategy parameters are cryptographically committed as keccak256 hashes stored on ENS text records under vault subnames (e.g., `vault-id.polyagents.eth`), enabling public verification that the agent follows its declared policy. Live agent stats (PnL, cycles, flips, mode) are updated on ENS every cycle.

The project integrates three sponsor chains: Arc for USDC-native prediction market settlement via PolyAgentsMarket.sol, Hedera for HCS per-step audit logging + HCS-14 agent identity + HTS token gating + HBAR oracle micropayments, and ENS Sepolia for cryptographic policy commitment + ENSIP-25 agent profiles + live stats on vault subnames.

The frontend is a complete Next.js 16 dashboard with real-time PnL sparklines, live order book visualization, AI reasoning display, engine cycle logs, ENS verification panel, and a full audit trail.

Deployed contracts and proofs:
- PolyAgentsMarket.sol on Arc Testnet: https://testnet.arcscan.app/address/0xBa04b7AF36b90D05559F7CcCEDd1d34049f1D68f
- ENS domain with vault subnames: https://sepolia.app.ens.domains/polyagents.eth?tab=records
- Hedera HBAR payment collector: https://hashscan.io/testnet/account/0.0.8510492
- Architecture diagram: https://github.com/Fbiondo00/PolyAgents/blob/main/docs/arc-architecture.md

How it's made *
Tell us about how you built this project; the nitty-gritty details. What technologies did you use? How are they pieced together? If you used any partner technologies, how did you benefit your project? Did you do anything particuarly hacky that's notable and worth mentioning? (min 280 characters)

**Frontend:** Next.js 16.2 App Router with React 19, TypeScript strict mode, Tailwind CSS 4 with a custom dark theme, shadcn/ui components (Radix primitives with CVA variants), Recharts for PnL sparklines and audit charts, sonner for toasts, and lucide-react for icons. All pages are client components with localStorage persistence — no API routes, no database. Authentication via Privy for multi-chain wallet creation (email, social, wallet connect).

**Trading Engine:** A modular step-based architecture under `actions/engine/` with 11 discrete steps (discover-market, ai-analysis, place-bets, check-fills, sell-coverage, handle-expiry, reconcile, log-hedera, update-ens, mirror-arc, ensure-polygon-liquidity) orchestrated by `trading-cycle.ts`. The fill simulator (`lib/engine/strategy/fill-simulator.ts`) uses deterministic rules against real Polymarket CLOB order book data — fills BUY when bestAsk <= our price, fills SELL when bestBid >= our price. Three operating modes via `POLYMARKET_LIVE` env var: `false` (ReadOnlyClobAdapter — simulated orders, real data), `demo` (real CLOB, no bridges), `true` (fully live with Circle bridge).

**AI Analysis:** Vercel AI SDK with Gemini 2.0 Flash Lite via Vercel AI Gateway. Each cycle, the engine sends market context (current price, order book depth, time to expiry) and receives a structured trade decision (shouldTrade, direction, confidence, reasoning). The cost is metered and paid in HBAR to the Hedera oracle collector.

**Arc Integration:** PolyAgentsMarket.sol deployed on Arc Testnet — a Solidity contract with Ownable, Pausable, and ReentrancyGuard for binary prediction market creation, USDC betting, resolution, and claim flows. viem client for contract interaction. Circle Bridge Kit integration for USDC liquidity bridging between Polygon and Arc (steps 4.5 and 10.5 of the trading cycle).

**Hedera Integration:** @hashgraph/sdk for native Hedera services — HTS for vault token creation with custom fee schedules, HCS for per-step audit logging (7 new event types: MARKET_DISCOVERED, AI_DECISION, ORDERS_PLACED, FILLS_DETECTED, SELLS_PLACED, RECONCILIATION, PNL_UPDATE), HCS-14 for on-chain agent identity (Universal Agent ID), HBAR micropayments per cycle for LLM oracle cost, scheduled transactions for future-dated operations, and Mirror Node queries for audit trail retrieval. All Hedera operations use the SDK directly — no Solidity on Hedera.

**ENS Integration:** viem on Sepolia for ENS subname creation (`vault-id.polyagents.eth`), keccak256 policy hash commitment as text records (`policy.commitment`), live agent stats as queryable text records (`agent.pnl`, `agent.flips`, `agent.cycles`, `agent.mode`, `agent.engineState`, `agent.inventory`, `agent.lastTrade`), ENSIP-25 agent identity records (`ai.agent.hcs14-uaid`, `ai.agent.capabilities`, `ai.agent.network`), and a custom SimpleTextResolver.sol deployed on Sepolia for gas-efficient text record reads. Policy verification UI compares on-chain hash with locally computed hash to prove agent integrity.
