# PolyAgents

AI-powered autonomous trading vault for Polymarket BTC "Up or Down" 5-minute binary markets. Built for ETHGlobal Cannes 2026.

## How It Works

PolyAgents runs a continuous trading cycle (every 5 seconds) that:

1. Discovers the active BTC 5-min market from Polymarket's Gamma API
2. Gets an AI trade decision (direction, confidence, reasoning) via a Craftshost-hosted, OpenAI-compatible model (default `gemma4:12b`, served through Ollama and routed via Langfuse)
3. Places passive limit orders on both YES and NO sides ($0.01 bids, $0.02 asks)
4. Simulates fills against real order book data (or places real CLOB orders in `demo`/`true` modes)
5. Writes every cycle through a Rust state machine — orders, fills, PnL, and trade outcomes land in Postgres
6. Feeds decision→outcome pairs back into the OpenClaw learning layer, which reflects and updates the guidance injected into the next cycle's AI prompt

The strategy is passive market-making: capture the spread between bid and ask, with AI deciding direction bias.

## Features

- **Autonomous AI trading** — OpenAI-compatible LLM analysis every cycle, decides direction and confidence
- **Real market data** — Live Polymarket order books and BTC 5-min market discovery (Gamma API)
- **Simulated or real fills** — Deterministic fill simulator against real order book movement; switch to live CLOB orders via the operating mode
- **Rust engine** — `poly-engine` state machine (IDLE → DISCOVERING_MARKET → READY → QUOTING → HOLDING_INVENTORY → EXPIRY_GUARD → ROLLING_OVER → RECONCILING) plus a reconciler that closes trade outcomes against resolved markets
- **OpenClaw learning loop** — decision/outcome feedback is reflected by an OpenClaw agent and fed back as `active_guidance` into the engine AI prompt
- **Multi-mode operation** — Simulator (default), demo (real orders, no on-chain settlement), or fully live

## Tech Stack

- **Next.js 16.2** (App Router, React 19, TypeScript)
- **Tailwind CSS 4** + shadcn/ui
- **Rust engine** (axum HTTP API + `poly-mcp` MCP server over stdio)
- **Craftshost / OpenAI-compatible LLM** (`gemma4:12b` via Ollama, routed via Langfuse)
- **Polymarket CLOB API** + Gamma API
- **viem** (Polygon USDC / wallet interactions)
- **Privy** (wallet auth)
- **PostgreSQL** via Supabase (local dev) / managed Postgres (prod) for vault/engine persistence

## Getting Started

```bash
# Start local Supabase (Postgres for the engine)
cd srcs/requirements/supabase && supabase start

# Build & run the Rust engine (HTTP API on port 8080, loopback by default)
cd srcs/requirements/engine
cargo run --release          # or: cargo build --release && ./target/release/polyagents-engine

# Start the frontend
cd srcs/requirements/frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

Copy `.env.example` to `.env`. Key variables:

| Variable | Purpose |
|----------|---------|
| `POLYMARKET_LIVE` | `false` (simulator), `demo` (real orders, no settlement), `true` (fully live) |
| `OPENAI_API_BASE` | OpenAI-compatible gateway endpoint (default: `https://openai.craftshost.com`) |
| `OPENAI_API_KEY` | Craftshost secret key (`sk-...` half) |
| `OPENAI_PUBLIC_KEY` | Langfuse public key (`pk-...` half, required by Craftshost routing) |
| `OPENAI_MODEL` | Model ID (default: `gemma4:12b`) |
| `POLYMARKET_API_KEY` / `POLYMARKET_API_SECRET` / `POLYMARKET_API_PASSPHRASE` | Polymarket CLOB credentials (live mode only) |
| `POLYMARKET_PRIVATE_KEY` | EOA private key signing CLOB orders (live mode only) |
| `POLYGON_RPC_URL` | Polygon RPC (USDC / wallet) |
| `DATABASE_URL` | Postgres connection string for the engine |
| `VAULT_ENCRYPTION_KEY` | AES-256-GCM key encrypting per-vault keypairs (generate with `openssl rand -hex 32`) |
| `ENGINE_API_TOKEN` | Shared bearer token gating the engine's money/state-mutating routes |
| `NEXT_PUBLIC_ENGINE_URL` | Engine API URL inlined into the frontend bundle (build-time) |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase URL + anon key (build-time) |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy app ID (build-time) |

## Operating Modes

| `POLYMARKET_LIVE` | Orders | Market Data |
|---|---|---|
| `false` | Simulated | Real |
| `demo` | Real CLOB | Real |
| `true` | Real CLOB | Real |

## Architecture

See [docs/arc-architecture.md](docs/arc-architecture.md) for the system architecture, trading cycle steps, and file index.

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/arc-architecture.md](docs/arc-architecture.md) | System architecture and file index |
| [docs/Polymarket-Strategy.md](docs/Polymarket-Strategy.md) | Trading strategy details (historical — describes an earlier Python prototype) |
| [docs/engine-proposal.md](docs/engine-proposal.md) | Engine specification (historical) |
| [docs/user-flow.md](docs/user-flow.md) | User flows (historical) |
| [docs/validation.md](docs/validation.md) | Prize track eligibility analysis (historical) |

> **Note:** `docs/sponsors/` (`arc.md`, `hedera.md`, `ens.md`) and `docs/validation.md` are **historical pre-hackathon plans** for Arc / Hedera / ENS sponsor integrations that were explored and then stripped (commit `66f74c8`). None of that sponsor code exists in the repo today — treat these docs as design history, not implemented features.
