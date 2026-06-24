# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**PolyAgents** is a hackathon prototype (ETHGlobal Cannes 2026) for an AI-powered autonomous trading vault targeting Polymarket BTC "Up or Down" 5-minute binary markets. The strategy is passive market-making: place $0.01 limit bids on both sides, flip fills at $0.02 for 100% spread capture.

The prototype integrates three sponsor chains:
- **Arc** (EVM L1) — USDC-native vault for position settlement and PnL
- **Hedera** — HTS token gating, HCS audit logging, HBAR micropayments per agent cycle, HCS-14 agent identity
- **ENS** — Strategy policy hash committed as text records on vault subnames

**Login/Wallet provider:** [Privy](https://privy.io) — multi-chain wallet authentication (email, social login, or wallet connect). Currently mocked via `PrivyConnectMock` component (`components/privy-connect-mock.tsx`). The real integration will use `@privy-io/react-auth` for instant testnet wallet creation with auto-funded Arc USDC, Hedera HBAR, and Polygon MATIC.

## Build & Run Commands

```bash
# Frontend (Next.js 16 on port 3000)
cd srcs/requirements/frontend
npm run dev       # Start dev server
npm run build     # Production build
npm run start     # Start production server
npm run lint      # ESLint

# Build packages (order: schema → sdk → mcp)
cd srcs/requirements/schema && npm install && npm run build
cd srcs/requirements/sdk && npm install && npm run build
cd srcs/requirements/mcp && npm install && npm run build

# MCP server
cd srcs/requirements/mcp && node dist/index.js

# Full stack (Postgres 15 + Rust engine + frontend) via docker compose
cp .env.example .env          # then fill in real values (incl. NEXT_PUBLIC_*)
docker compose -f srcs/docker-compose.yml up --build -d
docker compose -f srcs/docker-compose.yml logs -f engine
```

No test runner is configured for the frontend.

## Architecture

### Project Structure (Inception-style)

```
PolyAgents/
├── CLAUDE.md, README.md
├── docs/                     # All documentation
└── srcs/
    └── requirements/
        ├── frontend/         # Next.js app (app/, components/, lib/, hooks/, public/)
        ├── schema/           # Shared types, schemas, constants (@polyagents/schema)
        ├── sdk/              # Business logic modules (@polyagents/sdk)
        ├── mcp/              # MCP server exposing SDK tools via stdio (@polyagents/mcp)
        └── openclaw/         # OpenClaw AI agent config + trading-cycle skill
```

### SDK-First Architecture

All shared logic lives in three npm packages:

1. **`@polyagents/schema`** — Types, Zod schemas, constants, config (no business logic, no runtime deps)
   - `src/types/` — Vault, EngineState, HederaContext, AgentHooks, TradeDecision, etc.
   - `src/zod/` — strategyConfigSchema, engineStartSchema, marketTickSchema
   - `src/constants/` — chain IDs, RPC URLs, engine defaults
   - `src/config/` — Arc, Hedera, ENS configuration from env vars
   - Location: `srcs/requirements/schema/src/`

2. **`@polyagents/sdk`** — Business logic, imports schema
   - `src/modules/hedera/` — Client, HCS logger, HTS vault, agent identity, payments, mirror node, scheduler, vault init
   - `src/modules/arc/` — Arc market client (viem), ABI, betting, resolution, USDC helpers
   - `src/modules/ens/` — Client, subname management, policy commitment, agent stats, fleet registry, vault metadata
   - `src/modules/engine/` — Repositories (localStorage CRUD), PnL computation
   - `src/modules/supabase/` — Supabase client factory, typed queries for all 8 tables
   - `src/modules/store/` — Vault store, vault registry (in-memory)
   - `src/modules/main.ts` — `PolyAgentsImpl` facade class exposing all modules
   - `src/providers/` — Client factories (Hedera provider)
   - Location: `srcs/requirements/sdk/src/`

3. **`@polyagents/mcp`** — MCP server exposing SDK as composable AI tools via stdio
   - **15 tools:** `start_engine`, `stop_engine`, `run_cycle`, `engine_status`, `fetch_market`, `init_vault`, `pay_oracle`, `fetch_audit`, `hedera_health`, `commit_policy`, `verify_policy`, `fetch_agent_stats`, `create_market`, `place_bet`, `resolve_market`
   - **2 resources:** `vault://{vaultId}`, `market://{vaultId}`
   - Location: `srcs/requirements/mcp/src/`

### Frontend

**Next.js 16.2** with App Router (React 19), TypeScript, Tailwind CSS 4, shadcn/ui.

All pages are `'use client'` components. No Server Components, no API routes, no Server Actions.

### Routing Structure

```
/                          → HomeClient (vault list + create CTA)
/vault/create              → 5-step vault creation wizard
/vault/[id]                → Vault dashboard (KPIs, PnL chart, inventory, activity feed)
/vault/[id]/markets        → Market browser with order book, AI fill probability, manual bid placement
/vault/[id]/policy         → Strategy parameter editor with policy hash preview
/vault/[id]/audit          → Full audit trail with chart, filters, CSV export
/vault/[id]/agent          → Agent control panel (auto/advisory toggle, AI reasoning, cycle log)
/vault/[id]/token          → HTS token gate status and NFT holdings display
```

### Data Layer

**PostgreSQL (primary backend)** — plain Postgres 15, run as the `db` service in
`srcs/docker-compose.yml` (no Supabase). The Rust engine connects via
`DATABASE_URL` (sqlx `PgPool`) and applies its SQL migrations on boot
(`sqlx::migrate!("./migrations")`, files in `srcs/requirements/engine/migrations/`).
11 tables: vaults, engine_runs, virtual_orders, market_states, strategy_configs,
pnl_snapshots, audit_events, cached_books, vault_keypairs, trade_outcomes,
active_guidance.

**localStorage (frontend demo / legacy)** — persists across reloads without backend
- `lib/store.ts` — CRUD helpers over `localStorage`
- `@polyagents/sdk` → `modules/engine/repositories.ts` — engine runs, orders, market state, PnL
- Keys: `polyagents.vaults`, `polyagents.selectedVaultId`, `polyagents.demoVaultCreated`, `polyagents.engine.runs`, `.orders`, `.states`, `.pnl`, `.audits`, `.books`, `.configs`

### Layout & Navigation

- `app/vault/[id]/layout.tsx` wraps all vault sub-routes with `StatusRail` (desktop sidebar) and `MobileNav` (bottom tab bar)
- Vault is loaded from localStorage by URL param `[id]`; re-read on window focus event

### Key Domain Concepts

The trading strategy (documented in `docs/Polymarket-Strategy.md`) operates as a state machine: IDLE → DISCOVERING_MARKET → READY → QUOTING → HOLDING_INVENTORY → EXPIRY_GUARD → ROLLING_OVER → RECONCILING. The current frontend simulates this via the `CycleButton` component and auto-mode interval in `AgentPage`.

### Sponsor Integration docs

`docs/sponsors/` contains step-by-step implementation plans for each sponsor bounty:
- **Arc** (`docs/sponsors/arc.md`) — Solidity `PolyAgentsMarket` for binary prediction markets with USDC on Arc Testnet
- **Hedera** (`docs/sponsors/hedera.md`) — HTS token creation, HCS audit topics, HCS-14 agent identity, scheduled transactions, Mirror Node queries
- **ENS** (`docs/sponsors/ens.md`) — Cryptographic commitment via ENS text records (`policy.commitment`) + live agent stats on vault subnames

Other docs:
- **Engine specification** (`docs/engine-proposal.md`) — Full Polymarket simulation engine with state machine, risk engine, fill simulator
- **Validation** (`docs/validation.md`) — Prize track eligibility analysis ($9,500 across Arc + Hedera + ENS)
- **User flows** (`docs/user-flow.md`) — All 10 user flows documented end-to-end

### Smart Contracts

Arc prediction market contracts were stripped after pivoting to Polymarket-native trading. Arc integration now uses direct EVM calls via viem (see `@polyagents/sdk` → `modules/arc/`).

### OpenClaw

`srcs/requirements/openclaw/` — OpenClaw MCP host config:
- `openclaw.json` — MCP server config pointing to `../mcp/dist/index.js`
- `skills/polyagents-trading-cycle/` — Autonomous trading skill definition + runner script

## Tech Stack

- **Next.js 16.2** with App Router (React 19)
- **TypeScript** strict mode
- **Tailwind CSS 4** with custom dark theme
- **shadcn/ui** components
- **Recharts** for PnL sparkline and audit bar chart
- **Zod** for validation
- **tsup** for package builds (ESM + CJS)
- **@modelcontextprotocol/sdk** for MCP server
- **viem** for Arc/ENS EVM interactions
- **@hashgraph/sdk** for Hedera operations
- **PostgreSQL 15** (plain, via `srcs/docker-compose.yml`) for vault/engine persistence — accessed by the Rust engine through sqlx

## Styling Conventions

- Dark theme with hardcoded hex colors (no CSS variables for colors):
  - Background: `#081216` (deepest), `#0E1B27` (card), `#081216` (inner)
  - Borders: `#1A3C50`
  - Primary/accent: `#00A8B5` (teal), `#4DD0E1` (light teal)
  - Positive: `#26A69A`, Negative: `#EF5350`, Warning: `#FF8F00`
  - Text: `#E1F5FE` (primary), `#B0BEC5` (muted)
- Fonts: `Inter` (sans/body), `Sora` (heading — `font-heading` class)
- Badge styles are inline `style={{}}` using type-to-color maps, not Tailwind classes
- Component library is shadcn/ui — new UI components should follow existing patterns in `components/ui/`

## Conventions

- **SDK-first**: All shared types in `@polyagents/schema`, business logic in `@polyagents/sdk`
- **Import rewrites**: SDK uses `@polyagents/schema` instead of `@/types/*` path aliases
- **Env vars**: SDK uses unprefixed vars (`HEDERA_OPERATOR_ID`, `ENS_OWNER_PRIVATE_KEY`, `ARC_PRIVATE_KEY`) instead of `NEXT_PUBLIC_*`
- **Build order**: schema → sdk → mcp (each depends on the previous)
- **MCP tools**: All chain operations exposed via `@polyagents/mcp` for AI agent consumption
- **Database access**: All persistence goes through the Rust engine (sqlx `PgPool` on `DATABASE_URL`); migrations live in `srcs/requirements/engine/migrations/` and run on boot

## Skills

The following skills are installed in `.claude/skills/`. Consult their `SKILL.md` files when working on relevant tasks:

- **grimoire-polymarket** — Polymarket CLOB API patterns (order placement, market discovery, WebSocket feeds). Use when implementing `poly-market` crate or any Polymarket trading logic.
- **rust-async-patterns** — Tokio async runtime patterns, channel-based concurrency, stream processing. Use for all Rust async code in the engine crates.
- **rust-best-practices** — Idiomatic Rust conventions, error handling (`thiserror`/`anyhow`), type design. Use for all Rust implementations.
- **rust-mcp-server-generator** — MCP server scaffolding in Rust. Use when building the Rust MCP server to expose engine tools to OpenClaw.
- **rust-engineer** — Trait design, ownership patterns, testing strategies. Use for `poly-engine` state machine and `MarketAdapter` trait.

## External APIs Referenced

- **Polymarket Gamma API** (`https://gamma-api.polymarket.com`) — market discovery and search
- **Polymarket CLOB API** — order book and trading (planned)
- **Hedera Mirror Node** (`https://testnet.mirrornode.hedera.com/api/v1`) — audit log queries
- **Arc Testnet RPC** — EVM interactions for prediction markets
- **ENS (Sepolia)** — text record commits, subname management
- **PostgreSQL** — `db` service in `srcs/docker-compose.yml` (internal to the compose network); expose on localhost via `srcs/docker-compose.db-port.yml` for local `psql` only
