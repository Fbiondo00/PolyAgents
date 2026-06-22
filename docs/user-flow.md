# PolyAgents — User Flows

This document describes every user flow in the application, end-to-end. PolyAgents is a demo/prototype for ETHGlobal Cannes 2026 — an AI-powered autonomous trading vault for Polymarket BTC 5-minute binary markets, integrating Arc (EVM), Hedera (HTS/HCS/HBAR payments), and ENS.

State is persisted by a Rust engine backend with PostgreSQL (via Supabase). The frontend talks to the engine over HTTP through `lib/engine-api.ts` (which wraps the `engine` client for vault CRUD, audit, engine control, orders, PnL, market state, books, agent address, on-chain balance, and withdrawals). `lib/store.ts` delegates all reads and writes to these engine RPC calls — it no longer touches `localStorage`. The Rust engine (see `srcs/requirements/engine/`, crates `poly-db`, `poly-types`, `poly-market`, `poly-engine`, `poly-mcp`) owns the trading-cycle state machine and writes the 8 PostgreSQL tables defined in the Supabase migration (`00001_initial_schema.sql`).

---

## Flow 1: Home & Vault Selection

**Route:** `/`

**Component:** `HomeClient` (`components/home-client.tsx`)

1. User lands on the home page.
2. On first visit, a **demo vault** ("BTC Scalper Demo") is auto-initialized via `initDemoVault()` in `lib/store.ts`. It comes pre-populated with sample inventory, PnL history, audit events, and a simulated active market.
3. The home page displays:
   - A hero section with project branding.
   - A list of all existing vaults (fetched from the Rust engine via `getVaults()`).
   - A "Create Vault" call-to-action button.
4. User taps a vault card to navigate to `/vault/[id]` (the vault dashboard).
5. User taps "Create Vault" to navigate to `/vault/create`.

---

## Flow 2: Create Vault (4-Step Wizard)

**Route:** `/vault/create`

**Component:** `CreateVaultPage` (`app/vault/create/page.tsx`)

This is a 4-step wizard with a stepper UI at the top (Identity → Strategy → Policy → Deploy):

### Step 0 — Identity
- User enters a **vault name** (minimum 2 characters).
- User clicks **Connect Wallet** to authenticate via Privy (`@privy-io/react-auth` — `usePrivy` / `useWallets`, calling `login()`). Privy provides multi-chain wallet authentication (email, social login, or wallet connect). The connected wallet address is captured and stored on the vault.
- Both fields must be filled to proceed (name ≥ 2 chars + an authenticated wallet).

### Step 1 — Strategy
- User configures strategy parameters via `StrategyForm`:
  - `bidPrice` — default $0.20 (the passive buy price)
  - `sellPrice` — default $0.25 (the immediate flip sell target)
  - `maxCapital` — max USDC exposure cap
  - `trancheSize` — shares per order (default 10)
  - `noNewEntriesLast` — seconds before expiry to stop entering (default 10)
  - `keepSellAfter` — grace period for sell orders after expiry (default 10)
  - `aiEnabled` — toggle AI microstructure analysis
- Validation: sell price must be > bid price.

### Step 2 — Policy
- User chooses operating **mode**:
  - **Advisory** — AI recommends, operator approves each action manually.
  - **Auto** — Agent executes autonomously within strategy bounds.
- A JSON preview of the policy (name + mode + strategy) is shown.

### Step 3 — Deploy
- User reviews a final summary table (name, mode, bid/sell, max capital).
- Clicking **"Deploy Vault"** shows a spinner while the vault is created.
- A new `Vault` object is created with zeroed stats, the configured strategy, funding `{ usdc: 100, hbar: 0 }`, a random active market, and an initial `ai-analysis` audit event.
- The vault is persisted via `saveVault()`, which calls the Rust engine over HTTP (`engine.createVault` / `engine.updateVault`) — the engine writes PostgreSQL. (There is no per-stage deployment sequence and no on-chain Hedera/HCS/HTS steps in the frontend flow.)
- After deployment completes (~1.2s), the user is auto-redirected to `/vault/[id]`.

---

## Flow 3: Vault Dashboard

**Route:** `/vault/[id]`

**Layout:** `VaultLayout` (`app/vault/[id]/layout.tsx`) renders a `StatusRail` (left sidebar on desktop) + `MobileNav` (bottom tabs on mobile) around all sub-routes.

**Component:** `VaultDashboardPage` (`app/vault/[id]/page.tsx`)

This is the main operational view:

1. **Header** — vault name, mode badge (AUTO/ADVISORY), AI enabled indicator, and a "Run Cycle" button.
2. **KPI Grid** (2x2 on mobile, 4-column on desktop):
   - PnL (all-time, color-coded green/red)
   - Flips (completed fills)
   - Cycles (total runs)
   - USDC Balance (+ HBAR)
3. **PnL History** — sparkline chart (`PnLSparkline` using Recharts) of cumulative PnL.
4. **Inventory Card** — shows UP shares and DOWN shares held.
5. **Active Market** — market ID, mid price, expiry countdown (`ExpiryCountdown`), with link to Markets page.
6. **Recent Activity** — last 5 audit events from the vault, with links to full audit trail.

---

## Flow 4: Run a Trading Cycle (Manual)

**Trigger:** "Run Cycle" button (`CycleButton` component) on dashboard or agent page.

1. User clicks the cycle button.
2. A simulated 5-second autonomous cycle executes:
   - Checks HTS token gate (mocked).
   - Checks HBAR reserve balance (mocked).
   - Runs AI analysis (picks a random reasoning string).
   - Simulates a fill with ~50% probability.
   - If filled: increments inventory, records PnL delta (random $0.00–$0.25).
   - Updates vault stats (flips, cycles, PnL, sparkline).
   - Persists audit events to localStorage.
3. Dashboard KPIs update immediately after cycle completes.
4. Toast notification shows fill result.

---

## Flow 5: Agent Control (Auto Mode)

**Route:** `/vault/[id]/agent`

**Component:** `AgentPage` (`app/vault/[id]/agent/page.tsx`)

1. **Agent Status Panel** — shows running/paused state with a pulsing indicator. Toggle button to switch between Auto and Advisory mode.
2. **Market Countdown** — expiry countdown for the active market.
3. **HBAR Reserve Gauge** — visual progress bar showing remaining HBAR budget. Turns orange below 50%, red below 20%.
4. **AI Reasoning Panel** — displays the latest AI analysis text (randomly selected from a pool of pre-written reasoning strings). Shows "Active" or "Disabled" badge.
5. **Cycle Log** — scrollable list of all auto-cycle runs, each showing timestamp, stages passed, and PnL result.

When the agent is in **Auto mode**, cycles run automatically every ~12 seconds:
- A `setInterval` simulates the same cycle logic as manual (Flow 4).
- Each cycle logs reasoning, fill result, and PnL to the cycle log and audit trail.
- Toast notifications appear for positive fills.
- Switching to **Advisory** pauses the interval.

---

## Flow 6: Markets View

**Route:** `/vault/[id]/markets`

**Component:** `MarketsPage` (`app/vault/[id]/markets/page.tsx`)

1. Displays a list of **mock markets** (BTC 5m, ETH 5m, SOL 5m, HBAR 5m) with mid price and AI fill probability badge.
2. User selects a market to see its detail panel:
   - **Order Book** — simulated bid/ask table (`OrderBookTable`).
   - **Fill Probability Ring** — circular gauge (`FillProbabilityRing`) showing AI-assessed fill probability, with a textual recommendation (strong/moderate/weak signal).
   - **Side Selector** — choose UP or DOWN.
   - **Bid Summary** — shows side, price (from strategy bidPrice), shares (from strategy trancheSize), and total cost.
   - **Place Bid** button — simulates placing a bid with a 1.5s delay, then logs a `bid-placed` audit event and shows a toast.

---

## Flow 7: Policy Management

**Route:** `/vault/[id]/policy`

**Component:** `PolicyPage` (`app/vault/[id]/policy/page.tsx`)

1. Loads the vault's current strategy into `StrategyForm` for editing.
2. As parameters change, a **policy hash** is recomputed in real-time (simple JS hash function simulating `keccak256`). The hash is displayed in `PolicyHashCard`.
3. User clicks **"Save Policy"**:
   - 3-second simulated hash computation delay.
   - Vault is updated via `saveVault()` (which calls the Rust engine).
   - Toast confirms the save with the hash prefix.

---

## Flow 8: Audit Trail

**Route:** `/vault/[id]/audit`

**Component:** `AuditPage` (`app/vault/[id]/audit/page.tsx`)

1. **Activity Chart** — bar chart (Recharts) showing bids and fills aggregated by hour.
2. **Filter Tabs** — filter events by type: all, bid-placed, fill, sell-placed, rollover, ai-analysis.
3. **Event Table** — paginated list of all audit events with:
   - Timestamp
   - Event type (color-coded badge)
   - Market ID
   - Shares
   - Price
   - PnL (green for positive, red for negative)
   - Reasoning text (on mobile, shown inline)
4. **Export CSV** — downloads all audit events as a CSV file.

---

## Flow 9: Token & Access Gate

**Route:** `/vault/[id]/token`

**Component:** `TokenPage` (`app/vault/[id]/token/page.tsx`)

1. **Token Card** — displays the HTS token info (Token ID, balance, NFT count, network) with a gradient card design.
2. **Gate Status** — shows whether the token gate is active (balance > 0) or inactive. "Recheck" button simulates a 2-second verification delay.
3. **NFT Holdings** — lists mock NFTs with serial number, token ID, mint date, and IPFS metadata URI.

---

## Flow 10: Navigation

- **Desktop:** `StatusRail` component provides a vertical sidebar with icons for Dashboard, Markets, Policy, Audit, Agent, Token pages.
- **Mobile:** `MobileNav` component provides a bottom tab bar with the same navigation options.
- The vault layout (`app/vault/[id]/layout.tsx`) reads the vault from the Rust engine (via `getVaultById()`) using the `[id]` param and passes it to both nav components.

---

## State Architecture

All flows depend on a single `Vault` type (`types/vault.ts`) persisted by the Rust engine in PostgreSQL. The frontend never reads or writes `localStorage` for vault state — every read and write goes through HTTP calls to the engine.

**Persistence path:** frontend component → `lib/store.ts` helper → `engine` client in `lib/engine-api.ts` → HTTP `fetch` to `NEXT_PUBLIC_ENGINE_URL` (default `http://localhost:8080`) → Rust `poly-engine` / `poly-mcp` → PostgreSQL (Supabase, 8 tables per `00001_initial_schema.sql`).

Key mutations are performed through async helper functions in `lib/store.ts`:
- `saveVault()` / `getVaultById()` / `deleteVault()` — CRUD (delegate to `engine.createVault` / `engine.updateVault` / `engine.getVault` / `engine.deleteVault`)
- `getVaults()` — list all vaults (delegates to `engine.listVaults`)
- `addAuditEvent()` — client-side stub; audit events are written by the Rust engine itself
- `updateVaultStats()` — increment cycles, accumulate PnL, update sparkline (re-reads vault, then `saveVault`)
- `initDemoVault()` — first-run seeding of the demo vault

Engine-only endpoints (audit, engine control, orders, PnL, market state, books, agent address, on-chain balance, withdrawals) are called directly via the `engine` client from `lib/engine-api.ts` (e.g. by the dashboard's `lib/engine/repositories.ts` helpers).
