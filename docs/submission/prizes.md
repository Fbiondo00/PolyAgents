Prize	How are you using this Protocol / API? *
ENS - $10000
PolyAgents turns ENS into a cryptographic commitment and identity layer for autonomous trading agents. When a vault is created, strategy parameters are hashed via keccak256 and the commitment is stored as a `policy.commitment` text record on a vault subname (`vault-id.polyagents.eth`) — anyone can verify the agent follows its declared strategy by comparing the on-chain hash with a locally computed one. Live agent statistics (flips, PnL, inventory, mode, engine state, last trade) are pushed as individual text records every 5 seconds, turning each vault's ENS name into a real-time public identity card. Agent identity is registered via ENSIP-25 under the `ai.agent.*` namespace, linking the ENS name to the vault's HCS-14 Universal Agent ID with capability declarations. A SimpleTextResolver.sol deployed on Sepolia provides gas-efficient text record reads. The ENS Verification Card in the dashboard reads live stats, verifies policy integrity in real-time, and displays the full agent profile — all from on-chain ENS text records with zero hard-coded values.

Live proof: https://sepolia.app.ens.domains/polyagents.eth?tab=records

https://github.com/Fbiondo00/PolyAgents/tree/main/lib/ens
How easy is it to use the API / Protocol? (1 - very difficult, 10 - very easy)
7
 Text records as a verifiable key-value store are underappreciated — our keccak256 commitment scheme for agent strategies is a pattern that generalizes to any AI system needing public accountability. Batched writes and a formal ERC standard for agent commitments on ENS would make this a go-to identity layer for autonomous agents.
Arc - $15000
PolyAgents uses Arc as the USDC-native settlement layer for its AI-powered autonomous trading vault. PolyAgentsMarket.sol is deployed on Arc Testnet implementing binary YES/NO prediction markets for BTC 5-minute price signals. The contract supports the full lifecycle — market creation, USDC-denominated betting, resolution against real outcomes, and claim with a 0.5% protocol fee — all gas-funded in stablecoins. The agent's 13-step trading cycle runs continuously: discover the active BTC 5-min market from Polymarket's Gamma API, get an AI trade decision via Vercel AI Gateway (Gemini 2.0 Flash Lite), place orders (simulated or real via CLOB), detect fills against real order book data, sell coverage, and calculate PnL. Circle Bridge Kit integration routes USDC between Polygon (Polymarket liquidity) and Arc (settlement) automatically — the agent detects low Polygon liquidity, bridges USDC, places bets, mirrors filled positions to the Arc contract, and repatriates profits back to Arc. The fill simulator uses deterministic rules against real Polymarket order books — fills BUY when bestAsk <= our price, fills SELL when bestBid >= our price. Three operating modes: simulator (default, no real orders), demo (real CLOB, no bridges), and fully live with Circle bridge. Arc's deterministic finality and native USDC gas make it the ideal home chain for high-frequency autonomous agents.

Live contract: https://testnet.arcscan.app/address/0xBa04b7AF36b90D05559F7CcCEDd1d34049f1D68f

https://github.com/Fbiondo00/PolyAgents/tree/main/actions/arc
How easy is it to use the API / Protocol? (1 - very difficult, 10 - very easy)
9
 USDC as native gas is a genuine UX win — users understand dollar-denominated fees immediately, and deterministic finality is critical for our 5-minute market windows. A lightweight prediction market SDK and a streaming CCTP mode for continuous agent micro-transfers would unlock the full potential of the chain.
Hedera - $15000
PolyAgents integrates Hedera across six native services using pure @hashgraph/sdk TypeScript with zero Solidity on Hedera. Each vault gets a custom HTS fungible token with custom transfer fees, plus non-transferable operator tokens that gate access to auto-trading mode. Every engine step is immutably logged to a per-vault HCS topic with 7 granular event types: MARKET_DISCOVERED, AI_DECISION, ORDERS_PLACED, FILLS_DETECTED, SELLS_PLACED, RECONCILIATION, and PNL_UPDATE — each logged individually via `logEngineStep()`, creating a step-by-step on-chain audit trail queryable via Mirror Node. Before each LLM inference, the agent autonomously pays HBAR proportional to the previous call's actual token usage (prompt + completion tokens) — up to 720 verifiable micropayments per hour in auto mode, each logged to HCS with txId and consensus timestamp. The agent registers an on-chain identity via HCS-14 with a Universal Agent ID declaring its capabilities, and scheduled transactions enable future-dated vault rebalancing. The frontend displays live HCS audit logs, HTS token gate status, HBAR reserve gauge, and the HCS-14 UAID.

Live payment collector: https://hashscan.io/testnet/account/0.0.8510492

https://github.com/Fbiondo00/PolyAgents/tree/main/lib/hedera
How easy is it to use the API / Protocol? (1 - very difficult, 10 - very easy)
8
We really enjoyed the Hedera skills and MCP — the SDK-only approach (no Solidity) was refreshingly productive. HCS as a structured audit log with typed events is powerful. The main friction point was the TypeScript SDK's account management for testnet setup.
