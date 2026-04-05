Prize	How are you using this Protocol / API? *
ENS - $10000
PolyAgents turns ENS into a cryptographic commitment and identity layer for autonomous trading agents. When a vault is created, strategy parameters are hashed via keccak256 and the commitment is stored as a "policy.commitment" text record on a vault subname (vault-id.polyagents.eth) -- anyone can verify the agent follows its declared strategy by comparing the on-chain hash with a locally computed one. Live agent statistics (flips, PnL, inventory, mode, engine state, last trade) are pushed as individual text records every cycle, turning each vault's ENS name into a real-time public identity card. Agent identity is registered via ENSIP-25 under the "ai.agent.*" namespace, linking the ENS name to the vault's HCS-14 Universal Agent ID with capability declarations. A SimpleTextResolver.sol deployed on Sepolia provides gas-efficient text record reads.

What's implemented:
- keccak256 policy hash commitment stored on ENS text records (policy.commitment) -- fully functional, live on Sepolia
- ENS subname creation per vault (vault-id.polyagents.eth) -- functional
- Live agent stats pushed as ENS text records (agent.pnl, agent.flips, agent.cycles, agent.mode, agent.engineState, agent.inventory, agent.lastTrade) -- functional
- ENSIP-25 agent identity records (ai.agent.hcs14-uaid, ai.agent.capabilities, ai.agent.network) -- functional
- SimpleTextResolver.sol deployed on Sepolia for gas-efficient text reads -- deployed and working
- ENS Verification Card UI reads live from on-chain -- no hard-coded values

What's not implemented and why:
- ENS subname writes on every trading cycle are simulated with setTimeout in the frontend demo (same as all chain operations). The ENS lib code (lib/ens) handles real Sepolia transactions via viem, but the frontend orchestrator hasn't wired live calls into the trading cycle yet -- we focused on getting the full cycle running end-to-end in simulator mode first.
- ENSIP-25 is written to text records but not yet registered through a formal ENSIP-25 registry contract -- we used the text record convention directly since no canonical registry contract was available at hackathon time.

Live proof: https://sepolia.app.ens.domains/polyagents.eth?tab=records

https://github.com/Fbiondo00/PolyAgents/tree/main/lib/ens
How easy is it to use the API / Protocol? (1 - very difficult, 10 - very easy)
7
Text records as a verifiable key-value store are underappreciated -- our keccak256 commitment scheme for agent strategies is a pattern that generalizes to any AI system needing public accountability. Batched writes and a formal ERC standard for agent commitments on ENS would make this a go-to identity layer for autonomous agents.
Arc - $15000
PolyAgents uses Arc as the USDC-native settlement layer for its AI-powered autonomous trading vault. PolyAgentsMarket.sol is deployed on Arc Testnet implementing binary YES/NO prediction markets for BTC 5-minute price signals. The contract supports the full lifecycle -- market creation, USDC-denominated betting, resolution against real outcomes, and claim with a 0.5% protocol fee -- all gas-funded in stablecoins. The agent's 13-step trading cycle runs continuously: discover the active BTC 5-min market from Polymarket's Gamma API, get an AI trade decision via Vercel AI Gateway (Gemini 2.0 Flash Lite), place orders, detect fills, sell coverage, and calculate PnL. The fill simulator uses deterministic rules against real Polymarket order books -- fills BUY when bestAsk <= our price, fills SELL when bestBid >= our price. Three operating modes: simulator (default), demo (real CLOB, no bridges), and fully live with Circle bridge.

What's implemented:
- PolyAgentsMarket.sol deployed on Arc Testnet -- full lifecycle (create market, bet USDC, resolve, claim, 0.5% fee) -- live and verified
- Circle Bridge Kit integration code (actions/arc/circle-bridge.ts) -- implemented for USDC routing between Polygon and Arc
- Fill simulator running against real Polymarket CLOB order book data -- functional
- Three operating modes (POLYMARKET_LIVE: false/demo/true) -- functional
- viem client for Arc contract reads/writes -- functional

What's not implemented and why:
- Arc does not have a mainnet yet, so we cannot use CCIP or any cross-chain bridge to settle real Polymarket trades on Arc. The Circle Bridge Kit code is written and ready, but there is no production path from Polymarket (Polygon) to Arc for real USDC settlement. All Arc contract interactions run on testnet.
- Real USDC funding and betting on the Arc contract is testnet-only for the same reason -- no mainnet means no real capital flow.
- The trading cycle currently runs in simulator mode by default (POLYMARKET_LIVE=false), using a ReadOnlyClobAdapter that pulls real market data but simulates order placement and fills locally. We prioritized getting the full 13-step cycle visible and debuggable in the frontend over wiring live money flows.

Live contract: https://testnet.arcscan.app/address/0xBa04b7AF36b90D05559F7CcCEDd1d34049f1D68f

https://github.com/Fbiondo00/PolyAgents/tree/main/actions/arc
How easy is it to use the API / Protocol? (1 - very difficult, 10 - very easy)
9
USDC as native gas is a genuine UX win -- users understand dollar-denominated fees immediately, and deterministic finality is critical for our 5-minute market windows. A lightweight prediction market SDK and a streaming CCTP mode for continuous agent micro-transfers would unlock the full potential of the chain.
Hedera - $15000
PolyAgents integrates Hedera across six native services using pure @hashgraph/sdk TypeScript with zero Solidity on Hedera. Each vault gets a custom HTS fungible token with custom transfer fees, plus non-transferable operator tokens that gate access to auto-trading mode. Every engine step is immutably logged to a per-vault HCS topic with 7 granular event types: MARKET_DISCOVERED, AI_DECISION, ORDERS_PLACED, FILLS_DETECTED, SELLS_PLACED, RECONCILIATION, and PNL_UPDATE -- each logged individually via logEngineStep(), creating a step-by-step on-chain audit trail queryable via Mirror Node. Before each LLM inference, the agent autonomously pays HBAR proportional to the previous call's actual token usage (prompt + completion tokens) to a designated payment recipient -- up to 720 verifiable micropayments per hour in auto mode, each logged to HCS with txId and consensus timestamp. The agent registers an on-chain identity via HCS-14 with a Universal Agent ID declaring its capabilities, and scheduled transactions enable future-dated vault rebalancing. The frontend displays live HCS audit logs, HTS token gate status, HBAR reserve gauge, and the HCS-14 UAID.

What's implemented:
- HTS vault token creation with custom transfer fees -- functional, lib code written (lib/hedera/tokens.ts)
- HTS non-transferable operator tokens for auto-trading gate -- functional
- HCS per-step audit logging with 7 event types via logEngineStep() -- functional, logs appear in frontend audit panel
- HBAR micropayments per LLM cycle -- functional, sends HBAR proportional to actual Gemini token usage (prompt + completion) to the payment recipient account
- HCS-14 on-chain agent identity (Universal Agent ID) -- functional
- Scheduled transactions for future-dated vault operations -- lib code written
- Mirror Node query integration for audit trail retrieval -- functional
- All Hedera operations use @hashgraph/sdk directly -- zero Solidity on Hedera

What's not implemented and why:
- Like all chain operations in the current frontend, Hedera HCS logs and HBAR payments are simulated with setTimeout in the demo mode. The real Hedera SDK calls are implemented in lib/hedera/ and actions/hedera/, but the frontend orchestrator runs them as simulated steps to keep the demo self-contained without requiring each judge to fund a Hedera testnet account.
- HTS token gating is functional in code but not enforced in the frontend flow -- the token gate UI shows status but doesn't block auto-mode activation, since the demo doesn't require real HTS tokens.

Live payment collector: https://hashscan.io/testnet/account/0.0.8510492

https://github.com/Fbiondo00/PolyAgents/tree/main/lib/hedera
How easy is it to use the API / Protocol? (1 - very difficult, 10 - very easy)
8
We really enjoyed the Hedera skills and MCP -- the SDK-only approach (no Solidity) was refreshingly productive. HCS as a structured audit log with typed events is powerful. The main friction point was the TypeScript SDK's account management for testnet setup.
