# PolyAgents — Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         VaultPilot UI                           │
│                      (Next.js 16 + React 19)                    │
│                                                                 │
│  ┌──────────┐   ┌────────────────┐   ┌──────────────────────┐ │
│  │  Privy   │   │  Server       │   │  AI Agent Engine     │ │
│  │  Auth    │──▶│  Actions      │◀──│  (State Machine)     │ │
│  │  Login   │   │  (actions/)   │   │                      │ │
│  └──────────┘   └───────┬────────┘   └──────────┬───────────┘ │
│       │                 │                       │              │
└───────┼─────────────────┼───────────────────────┼──────────────┘
        │                 │                       │
        │  Privy Wallet   │  viem clients         │  LLM calls
        │                 │                       │
┌───────┼─────────────────┼───────────────────────┼──────────────┐
│       ▼                 ▼                       ▼              │
│  ┌─────────────┐  ┌──────────────────────────────────────────┐  │
│  │  ENS        │  │          Multi-Chain Layer               │  │
│  │  Sepolia    │  │                                          │  │
│  │             │  │  ┌──────────────┐  ┌──────────────────┐  │  │
│  │ vault.      │  │  │  Arc Testnet │  │  Hedera Testnet  │  │  │
│  │ vaultpilot  │  │  │  (EVM L1)    │  │                  │  │  │
│  │ .eth        │  │  │              │  │  ┌────────────┐  │  │  │
│  │             │  │  │  VaultPilot  │  │  │ HTS Token  │  │  │  │
│  │ text:       │  │  │  Market      │  │  │ Gate       │  │  │  │
│  │  policy.    │  │  │  (USDC)      │  │  ├────────────┤  │  │  │
│  │  commitment │  │  │              │  │  │ HCS Audit  │  │  │  │
│  │  agent.     │  │  │  createMarket│  │  │ Log        │  │  │  │
│  │  lastTrade  │  │  │  placeBet    │  │  ├────────────┤  │  │  │
│  │             │  │  │  resolve     │  │  │ HCS-14     │  │  │  │
│  └─────────────┘  │  │  claim       │  │  │ Agent ID   │  │  │  │
│                   │  │              │  │  ├────────────┤  │  │  │
│                   │  │  USDC gas    │  │  │ HBAR       │  │  │  │
│                   │  │  token       │  │  │ Micro-pay  │  │  │  │
│                   │  └──────────────┘  │  └────────────┘  │  │  │
│                   │                    └──────────────────┘  │  │
│                   └──────────────────────────────────────────┘  │
│                                                                 │
│  Data Flow:                                                     │
│                                                                 │
│  1. User logs in via Privy (email/social) → embedded wallet    │
│  2. AI Agent analyzes Polymarket data via LLM                  │
│  3. Agent creates binary market on Arc (USDC-native)           │
│  4. Agent places 2-sided bets (market making strategy)         │
│  5. Every action logged to Hedera HCS (immutable audit)        │
│  6. Agent identity verified via HCS-14 on Hedera               │
│  7. Strategy policy hash committed to ENS (verifiable)        │
│  8. Token-gated access via HTS on Hedera                      │
│                                                                 │
│  Smart Contracts:                                               │
│  ┌─────────────────────────────────────────────────────┐       │
│  │  VaultPilotMarket.sol (Arc Testnet)                  │       │
│  │  - Ownable + Pausable + ReentrancyGuard             │       │
│  │  - createMarket() — authorized agents only           │       │
│  │  - placeBet() — USDC in, shares out                  │       │
│  │  - resolveMarket() — resolver or owner                │       │
│  │  - claimWinnings() — proportional payout, 0.5% fee   │       │
│  │  - getOdds() — live market probability               │       │
│  └─────────────────────────────────────────────────────┘       │
│                                                                 │
│  Key Files:                                                     │
│  contracts/src/VaultPilotMarket.sol    — Solidity contract      │
│  contracts/script/DeployLocal.s.sol     — Local deploy          │
│  contracts/script/Deploy.s.sol          — Arc Testnet deploy    │
│  lib/arc/abi.ts                        — Contract ABI          │
│  lib/arc/market-client.ts              — viem client           │
│  lib/arc/smoke-test.ts                 — Full lifecycle test    │
│  actions/arc/markets.ts                — Next.js Server Actions│
└─────────────────────────────────────────────────────────────────┘
```

## Sponsor Chain Integration

| Chain | Role | Gas Token | Key Features |
|-------|------|-----------|--------------|
| **Arc** (EVM L1) | Prediction markets | USDC | `VaultPilotMarket` contract, 0.5% protocol fee |
| **Hedera** | Audit + Identity | HBAR | HCS logging, HTS token gate, HCS-14 agent ID |
| **ENS** (Sepolia) | Policy verification | ETH | Strategy hash commitment on subnames |
