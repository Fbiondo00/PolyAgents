# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**PolyAgents** is a hackathon prototype (ETHGlobal Cannes 2026) for an AI-powered autonomous trading vault targeting Polymarket BTC "Up or Down" 5-minute binary markets. The strategy is passive market-making: place $0.01 limit bids on both sides, flip fills at $0.02 for 100% spread capture.

PolyAgents is a lean Polymarket bot: a Rust engine (axum HTTP API + state machine + reconciler), a Next.js frontend, Postgres/Supabase persistence, and an OpenClaw learning layer. There are **no Arc/Hedera/ENS integrations** — sponsor code was explored pre-hackathon and then stripped (commit `66f74c8`); `docs/sponsors/` is historical only (see "Sponsor Integration docs" below).

**Login/Wallet provider:** [Privy](https://privy.io) — multi-chain wallet authentication (email, social login, or wallet connect). The real `@privy-io/react-auth` integration is wired in `app/providers.tsx` (`PrivyProvider`) and the login UI in `components/privy-login-button.tsx`. (There is no mock component — `PrivyConnectMock` does not exist.)

## Build & Run Commands

```bash
# Frontend (Next.js 16 on port 3000)
cd srcs/requirements/frontend
npm run dev       # Start dev server
npm run build     # Production build
npm run start     # Start production server
npm run lint      # ESLint

# Rust engine (axum HTTP API on port 8080, loopback by default)
cd srcs/requirements/engine
cargo run --release                       # Build & run the engine binary
cargo build --release                     # Build only (binary: target/release/polyagents-engine)
cargo build --release -p poly-mcp         # Build the MCP server (target/release/poly-mcp)

# Supabase (local development)
supabase start                          # Start local Supabase containers
supabase stop                           # Stop containers
```

No test runner is configured for the frontend or engine.

## Architecture

### Project Structure (Inception-style)

```
PolyAgents/
├── CLAUDE.md, README.md
├── docs/                     # All documentation (mostly historical — see Sponsor Integration docs)
└── srcs/
    └── requirements/
        ├── engine/           # Rust workspace: axum HTTP API + poly-{types,db,market,ai,engine,mcp} crates + migrations/
        ├── frontend/         # Next.js app (app/, components/, lib/, actions/, hooks/, public/)
        ├── infra/            # Terraform (EC2 + RDS + S3/CloudFront) for prod
        ├── openclaw/         # OpenClaw MCP host config + reflect/trading-cycle skills + workspace/
        └── supabase/         # Local Supabase (config.toml, migrations/)
```

### Rust Engine Workspace

All trading/business logic lives in the Rust workspace at `srcs/requirements/engine/`. The binary (`polyagents-engine`, `src/main.rs`) serves an axum HTTP API on port 8080 (loopback by default) for the frontend, gated behind a shared bearer token (`ENGINE_API_TOKEN`) for money/state-mutating routes. A separate MCP server (`poly-mcp`, `crates/poly-mcp/`) exposes the engine to AI agents over stdio.

- **`poly-types`** — Domain types: `Vault`, `StrategyConfig`, `EngineStatus`, `TradeOutcome`, `AppConfig`, etc.
- **`poly-db`** — Postgres (sqlx) repositories: vaults, keypairs (AES-256-GCM encrypted), strategy configs, orders, pnl snapshots, audit events.
- **`poly-market`** — Polymarket adapter (Gamma market discovery, CLOB order book + order placement, Polygon USDC/onchain).
- **`poly-ai`** — OpenAI-compatible client (Craftshost gateway, default `gemma4:12b` via Ollama) + strategy prompt builder.
- **`poly-engine`** — State machine + cycle loop + reconciler (closes trade outcomes against resolved markets; feeds decision→outcome into the OpenClaw learning loop via `active_guidance`).
- **`poly-mcp`** — MCP server exposing the engine as composable AI tools over stdio
   - **18 tools** (`srcs/requirements/engine/crates/poly-mcp/src/server.rs`):
     - **Engine control:** `start_engine`, `stop_engine`, `engine_status`, `active_engines`, `cancel_orders`
     - **Vaults:** `list_vaults`, `get_vault`, `create_vault`
     - **Observation (read):** `get_orders`, `get_pnl`, `get_audit`, `get_recent_outcomes` (the decision→outcome feedback signal — the learning loop's primary read)
     - **Strategy (write):** `update_config` (numeric tunables), `get_active_guidance` / `set_active_guidance` (contextual advice injected into the engine AI's prompt — the closed learning loop)
     - **Funding:** `vault_agent_address`, `vault_balance`, `withdraw_vault`
   - All tools take `vault_id`; limit-bearing ones accept an optional `limit` (default 50–100).
   - No resources are exposed; everything is tool-based.

### Frontend

**Next.js 16.2** with App Router (React 19), TypeScript, Tailwind CSS 4, shadcn/ui.

Most vault pages are `'use client'` components, but the data layer talks to the Rust engine via **Next.js Server Actions** (`actions/engine/index.ts`) and **API routes** (`app/api/engine/cron/{reconcile,repatriate}/route.ts`) that call the engine's HTTP API at `process.env.ENGINE_URL` (falling back to `http://localhost:8080`). Do not assume everything is client-side.

### MCP servers available

Both Claude Code and OpenClaw connect to these MCP servers. Secrets (DB password, API keys) never live in committed config — they're read from the gitignored `.env` / `~/.openclaw/polyagents.env` (0600).

- **`polyagents`** (Rust `poly-mcp`, stdio) — the engine. All 18 vault/engine/trading tools listed in the Rust Engine Workspace section above. This is how the agent controls trading. Config: `~/.openclaw/openclaw.json` (OpenClaw) / launched by the host for Claude Code.
- **`postgres-supabase`** (`@modelcontextprotocol/server-postgres`, stdio) — **read-only** SQL + schema inspection against the Supabase Postgres backing the engine (`vaults`, `trade_outcomes`, `active_guidance`, `virtual_orders`, `pnl_snapshots`, `audit_events`, etc.). Use it to run ad-hoc `SELECT`s, inspect the schema, or verify what the reconciler wrote. Connection string is supplied via a wrapper script that reads the URL from the sidecar env — never inline it. Tools: `query` (read-only SQL), `list_tables`, `describe_table`, `schema_info`, etc.
- **Host-provided utility servers** (Claude Code only, via `~/.claude.json`): `exa` (web search/fetch), `searxng` (meta web search), `zai-mcp-server` + `web-search-prime`/`web-reader`/`zread` (web search/read + GitHub repo reading), `terraform` (infra state). These are general-purpose research/ops tools, not PolyAgents-specific.

### Routing Structure

```
/                          → HomeClient (vault list + create CTA)
/vault/create              → 4-step vault creation wizard (Identity → Strategy → Policy → Deploy)
/vault/[id]                → Vault dashboard (KPIs, PnL chart, inventory, activity feed)
/vault/[id]/markets        → Market browser with order book, AI fill probability, manual bid placement
/vault/[id]/policy         → Strategy parameter editor with policy hash preview
/vault/[id]/audit          → Full audit trail with chart, filters, CSV export
/vault/[id]/agent          → Agent control panel (auto/advisory toggle, AI reasoning, cycle log)
/vault/[id]/token          → Token gate placeholder (feature not implemented — "Token Gate Not Configured")
```

### Data Layer

Two persistence layers:

**Postgres / Supabase (primary backend)** — engine migrations at `srcs/requirements/engine/migrations/`, local dev via Supabase containers at `srcs/requirements/supabase/` (config.toml).
- The Rust engine owns these tables via `poly-db` (sqlx): `vaults`, `vault_keypairs` (AES-256-GCM encrypted), `engine_runs`, `virtual_orders`, `market_states`, `strategy_configs`, `pnl_snapshots`, `audit_events`, `cached_books`, `trade_outcomes`, `active_guidance` (11 tables — note the real names differ from the older `engine_*` schema in `docs/engine-proposal.md`).
- The frontend reads engine state through the HTTP API (Server Actions) and Supabase for client reads, using `@supabase/supabase-js`.

**localStorage (frontend demo / legacy)** — persists across reloads
- `lib/store.ts` — CRUD helpers over `localStorage` (vault list, selected vault, demo flags). The authoritative engine state lives in Postgres; localStorage is the frontend's local cache/fallback.

### Layout & Navigation

- `app/vault/[id]/layout.tsx` wraps all vault sub-routes with `StatusRail` (desktop sidebar) and `MobileNav` (bottom tab bar)
- The vault list/selection is held in localStorage (`lib/store.ts`); vaultId comes from the URL param `[id]`. Engine state is fetched from the Rust engine API on the vault pages.

### Key Domain Concepts

The trading strategy (documented in `docs/Polymarket-Strategy.md`) operates as a state machine: IDLE → DISCOVERING_MARKET → READY → QUOTING → HOLDING_INVENTORY → EXPIRY_GUARD → ROLLING_OVER → RECONCILING. The current frontend simulates this via the `CycleButton` component and auto-mode interval in `AgentPage`.

### Sponsor Integration docs (HISTORICAL — not implemented)

> `docs/sponsors/` and `docs/validation.md` are **pre-hackathon design plans** for Arc / Hedera / ENS sponsor integrations that were explored and then entirely stripped (commit `66f74c8`). **No sponsor code exists in the repo today** (no Arc contracts, no `@hashgraph/sdk`, no ENS module). Treat these as design history, not implemented features — do not follow them as build instructions.

- **Arc** (`docs/sponsors/arc.md`) — historical Solidity `PolyAgentsMarket` plan for Arc Testnet (not built)
- **Hedera** (`docs/sponsors/hedera.md`) — historical HTS/HCS/HCS-14 plan (not built)
- **ENS** (`docs/sponsors/ens.md`) — historical ENS text-record / ENSIP-25 plan (not built)

Other docs (also historical):
- **Engine specification** (`docs/engine-proposal.md`) — original proposal; table names (`engine_*`) differ from the actual migration schema in `srcs/requirements/engine/migrations/`
- **Validation** (`docs/validation.md`) — the Arc+Hedera+ENS prize-eligibility analysis is obsolete; those integrations are not implemented
- **User flows** (`docs/user-flow.md`) — written against the earlier 5-step / Hedera-stage flow; the current create wizard is 4 steps (no chain stages)

### Smart Contracts

There are no on-chain smart contracts. The earlier Arc `PolyAgentsMarket` Solidity contracts were stripped when the project pivoted to Polymarket-native trading. The only EVM usage is Polygon USDC / wallet reads via viem (`lib/polygon-wallet.ts`).

### OpenClaw

`srcs/requirements/openclaw/` — OpenClaw MCP host config (the learning layer):
- `openclaw.json` — MCP server config; the `polyagents` server runs the Rust `poly-mcp` binary (`srcs/requirements/engine/target/release/poly-mcp`), plus a `postgres-supabase` server. Secrets live in the gitignored sidecar `~/.openclaw/polyagents.env` (0600), installed by `scripts/setup-openclaw.sh`.
- `skills/polyagents-reflect/` and `skills/polyagents-trading-cycle/` — autonomous reflect/trading skills
- `workspace/` — `SOUL.md`, `HEARTBEAT.md`, `MEMORY.md`, `DREAMS.md`, `AGENTS.md`

## Tech Stack

- **Next.js 16.2** with App Router (React 19)
- **TypeScript** strict mode
- **Tailwind CSS 4** with custom dark theme
- **shadcn/ui** components
- **Recharts** for PnL sparkline and audit bar chart
- **Zod** for validation (frontend)
- **Rust** engine — axum HTTP API + `poly-{types,db,market,ai,engine,mcp}` crates; MCP server via `rmcp`; sqlx for Postgres
- **Craftshost / OpenAI-compatible LLM** (`gemma4:12b` via Ollama, routed via Langfuse) — see `poly-ai`
- **viem** for Polygon USDC / wallet reads (NOT Arc/ENS — those do not exist)
- **Privy** (`@privy-io/react-auth`) for wallet auth
- **PostgreSQL** via Supabase (local dev) / managed Postgres (prod) — `@supabase/supabase-js` for frontend client reads

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

- **Engine-first**: All trading/business logic lives in the Rust workspace (`srcs/requirements/engine/`); shared types in `poly-types`, DB access in `poly-db`, AI in `poly-ai`. The frontend calls the engine via the axum HTTP API (Server Actions in `actions/engine/`).
- **Build order**: build the Rust engine (`cargo build --release`) before starting the frontend or the MCP host; the frontend Server Actions expect the engine on `ENGINE_URL` / `localhost:8080`.
- **Env vars**: `NEXT_PUBLIC_*` vars are inlined into the browser bundle at build time (Privy app id, Supabase URL/anon key, engine URL). Server-side secrets (`POLYMARKET_*`, `OPENAI_*`, `DATABASE_URL`, `VAULT_ENCRYPTION_KEY`, `ENGINE_API_TOKEN`) stay server-side. See `.env.example` for the authoritative list.
- **MCP tools**: all engine operations exposed via the Rust `poly-mcp` server (18 tools) for AI agent consumption over stdio.
- **DB access**: all Postgres operations go through `poly-db` (sqlx, parameterized). The frontend uses `@supabase/supabase-js` for client reads.

## Skills

The following skills are installed in `.claude/skills/`. Consult their `SKILL.md` files when working on relevant tasks:

- **grimoire-polymarket** — Polymarket CLOB API patterns (order placement, market discovery, WebSocket feeds). Use when implementing `poly-market` crate or any Polymarket trading logic.
- **rust-async-patterns** — Tokio async runtime patterns, channel-based concurrency, stream processing. Use for all Rust async code in the engine crates.
- **rust-best-practices** — Idiomatic Rust conventions, error handling (`thiserror`/`anyhow`), type design. Use for all Rust implementations.
- **rust-mcp-server-generator** — MCP server scaffolding in Rust. Use when building the Rust MCP server to expose engine tools to OpenClaw.
- **rust-engineer** — Trait design, ownership patterns, testing strategies. Use for `poly-engine` state machine and `MarketAdapter` trait.

## External APIs Referenced

- **Polymarket Gamma API** (`https://gamma-api.polymarket.com`) — BTC 5-min market discovery and search
- **Polymarket CLOB API** — order book reads and order placement (live `demo`/`true` modes; requires `POLYMARKET_API_*` + signing key)
- **Craftshost LLM gateway** (`https://openai.craftshost.com`, OpenAI-compatible) — `gemma4:12b` via Ollama, routed via Langfuse (requires `OPENAI_API_KEY` + `OPENAI_PUBLIC_KEY`)
- **Polygon RPC** (`POLYGON_RPC_URL`) — USDC / wallet reads via viem
- **Supabase (local)** — `http://127.0.0.1:54321` — local PostgreSQL for vault/engine persistence (prod uses managed Postgres via Terraform RDS)
