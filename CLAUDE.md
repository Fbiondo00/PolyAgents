# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**PolyAgents** is a hackathon prototype (ETHGlobal Cannes 2026) for an AI-powered autonomous trading vault targeting Polymarket BTC "Up or Down" 5-minute binary markets. The strategy is passive market-making: place $0.01 limit bids on both sides, flip fills at $0.02 for 100% spread capture.

The prototype integrates three sponsor chains:
- **Arc** (EVM L1) — USDC-native vault for position settlement and PnL
- **Hedera** — HTS token gating, HCS audit logging, HBAR micropayments per agent cycle, HCS-14 agent identity
- **ENS** — Strategy policy hash committed as text records on vault subnames

**Login/Wallet provider:** [Privy](https://privy.io) — multi-chain wallet authentication (email, social login, or wallet connect). Currently mocked via `PrivyConnectMock` component (`components/privy-connect-mock.tsx`). The real integration will use `@privy-io/react-auth` for instant testnet wallet creation with auto-funded Arc USDC, Hedera HBAR, and Polygon MATIC.

**Current state:** Frontend-only demo — all data in localStorage, all chain operations simulated with `setTimeout`. No API routes, no server components, no database. See `docs/user-flow.md` for all 10 user flows.

## Commands

```bash
npm run dev       # Start dev server (Next.js 16 on port 3000)
npm run build     # Production build
npm run start     # Start production server
npm run lint      # ESLint
```

No test runner is configured. No Supabase or database is used.

## Tech Stack

- **Next.js 16.2** with App Router (React 19)
- **TypeScript** strict mode
- **Tailwind CSS 4** with custom dark theme (colors defined inline, not in tailwind config)
- **shadcn/ui** components (`components/ui/` — Radix primitives wrapped with CVA)
- **Recharts** for PnL sparkline and audit bar chart
- **Zod** for validation (dependency present, not actively used yet)
- **sonner** for toast notifications
- **lucide-react** for icons

## Architecture

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

All pages are `'use client'` components. There are no Server Components, no API routes, and no Server Actions.

### Data Layer

- **Types:** `lib/types.ts` — `Vault` interface with nested `strategy`, `funding`, `inventory`, `stats`, `activeMarket`, `audit[]`, and `sparkline`
- **Store:** `lib/store.ts` — CRUD helpers over `localStorage`. Key functions: `getVaults()`, `saveVault()`, `getVaultById()`, `addAuditEvent()`, `updateVaultStats()`, `initDemoVault()`
- **Demo vault:** `DEMO_VAULT` constant in `lib/types.ts` provides pre-seeded data (127 flips, $4.52 PnL, 23 UP / 17 DOWN shares)

localStorage keys:
- `polyagents.vaults` — serialized `Vault[]`
- `polyagents.selectedVaultId`
- `polyagents.demoVaultCreated` — prevents re-seeding on revisit

### Layout & Navigation

- `app/vault/[id]/layout.tsx` wraps all vault sub-routes with `StatusRail` (desktop sidebar) and `MobileNav` (bottom tab bar)
- Vault is loaded from localStorage by URL param `[id]`; re-read on window focus event

### Key Domain Concepts

The trading strategy (documented in `docs/Polymarket-Strategy.md`) operates as a state machine: IDLE → DISCOVERING_MARKET → READY → QUOTING → HOLDING_INVENTORY → EXPIRY_GUARD → ROLLING_OVER → RECONCILING. The current frontend simulates this via the `CycleButton` component and auto-mode interval in `AgentPage`.

### Sponsor Integration docs

`docs/sponsors/` contains step-by-step implementation plans for each sponsor bounty:
- **Arc** (`docs/sponsors/arc.md`) — Solidity `VaultPilotMarket` for binary prediction markets with USDC on Arc Testnet
- **Hedera** (`docs/sponsors/hedera.md`) — HTS token creation, HCS audit topics, HCS-14 agent identity, scheduled transactions, Mirror Node queries
- **ENS** (`docs/sponsors/ens.md`) — Cryptographic commitment via ENS text records (`policy.commitment`) + live agent stats on vault subnames

Other docs:
- **Engine specification** (`docs/engine-proposal.md`) — Full Polymarket simulation engine with state machine, risk engine, fill simulator
- **Validation** (`docs/validation.md`) — Prize track eligibility analysis ($9,500 across Arc + Hedera + ENS)
- **User flows** (`docs/user-flow.md`) — All 10 user flows documented end-to-end

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

## External APIs Referenced

- **Polymarket Gamma API** (`https://gamma-api.polymarket.com`) — market discovery and search (see `docs/api polymarket/`)
- **Polymarket CLOB API** — order book and trading (planned, not yet connected)
- **Hedera Mirror Node** (`https://testnet.mirrornode.hedera.com/api/v1`) — audit log queries (planned)
