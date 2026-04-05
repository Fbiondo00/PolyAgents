# PolyAgents

AI-powered autonomous trading vault for Polymarket BTC "Up or Down" 5-minute binary markets. Built for ETHGlobal Cannes 2026.

## How It Works

PolyAgents runs a continuous trading cycle (every 5 seconds) that:

1. Discovers the active BTC 5-min market from Polymarket's Gamma API
2. Gets an AI trade decision (direction, confidence, reasoning) via Vercel AI Gateway (Gemini 2.0 Flash Lite)
3. Places passive limit orders on both YES and NO sides ($0.01 bids, $0.02 asks)
4. Simulates fills against real order book data
5. Logs every step to Hedera HCS for full on-chain auditability
6. Updates ENS subnames with live agent stats

The strategy is passive market-making: capture the spread between bid and ask, with AI deciding direction bias.

## Sponsor Chains

| Chain | Role |
|-------|------|
| **Arc** (EVM L1) | USDC-native prediction markets via `PolyAgentsMarket` contract |
| **Hedera** | HCS audit logging (per-step), HTS token gating, HCS-14 agent identity, HBAR oracle micropayments |
| **ENS** (Sepolia) | Cryptographic policy hash commitment, ENSIP-25 agent profile, live stats on vault subnames |

## Features

- **Autonomous AI trading** — Gemini-powered analysis every cycle, decides direction and confidence
- **Real market data** — Live Polymarket order books and BTC 5-min market discovery
- **Simulated fills** — Deterministic fill simulator against real order book movement
- **On-chain audit trail** — Every engine step logged to Hedera HCS
- **ENS verification** — Strategy policy hash committed on-chain, verifiable via ENS subnames
- **Multi-mode operation** — Simulator (default), demo (real orders, no bridges), or fully live

## Tech Stack

- **Next.js 16** (App Router, React 19, TypeScript)
- **Tailwind CSS 4** + shadcn/ui
- **Vercel AI SDK** (Gemini 2.0 Flash Lite)
- **Polymarket CLOB API** + Gamma API
- **Hedera SDK** (HCS, HTS, Mirror Node)
- **viem** (Arc + ENS Sepolia)
- **Privy** (wallet auth)

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

Copy `.env.example` to `.env.local`. Key variables:

| Variable | Purpose |
|----------|---------|
| `POLYMARKET_LIVE` | `false` (simulator), `demo` (real orders, no bridges), `true` (fully live) |
| `VERCEL_AI_API_KEY` | Vercel AI Gateway API key |
| `VERCEL_AI_GATEWAY_URL` | Vercel AI Gateway endpoint |
| `VERCEL_AI_DEFAULT_MODEL` | Model ID (default: `google/gemini-2.0-flash-lite`) |
| `HEDERA_OPERATOR_ID` / `HEDERA_OPERATOR_KEY` | Hedera testnet operator |
| `HEDERA_NETWORK` | `testnet` |
| `NEXT_PUBLIC_ENS_OWNER_PRIVATE_KEY` | ENS owner key for subname management |
| `NEXT_PUBLIC_ENS_BASE_DOMAIN` | Base ENS domain (e.g. `polyagents.eth`) |
| `ARC_PRIVATE_KEY` | Arc testnet wallet key |
| `ARC_NETWORK` | `testnet` |
| `POLYMARKET_API_KEY` / `POLYMARKET_API_SECRET` | Polymarket CLOB credentials (live mode only) |

## Operating Modes

| `POLYMARKET_LIVE` | Orders | Market Data | Bridges |
|---|---|---|---|
| `false` | Simulated | Real | Skipped |
| `demo` | Real CLOB | Real | Skipped |
| `true` | Real CLOB | Real | Active |

## Architecture

See [docs/arc-architecture.md](docs/arc-architecture.md) for full system architecture, trading cycle steps, Mermaid diagrams, and file index.

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/arc-architecture.md](docs/arc-architecture.md) | Full system architecture and file index |
| [docs/Polymarket-Strategy.md](docs/Polymarket-Strategy.md) | Trading strategy details |
| [docs/engine-proposal.md](docs/engine-proposal.md) | Engine specification |
| [docs/user-flow.md](docs/user-flow.md) | All 10 user flows |
| [docs/validation.md](docs/validation.md) | Prize track eligibility analysis |
| [docs/sponsors/arc.md](docs/sponsors/arc.md) | Arc integration plan |
| [docs/sponsors/hedera.md](docs/sponsors/hedera.md) | Hedera integration plan |
| [docs/sponsors/ens.md](docs/sponsors/ens.md) | ENS integration plan |
