# PolyAgents — User Flows

This document describes every user flow in the application, end-to-end. PolyAgents is a demo/prototype for ETHGlobal Cannes 2026 — an AI-powered autonomous trading vault for Polymarket BTC 5-minute binary markets, integrating Arc (EVM), Hedera (HTS/HCS/HBAR payments), and ENS.

All state is currently stored in `localStorage` (see `lib/store.ts`). No backend or database is wired yet — all trading cycles and chain interactions are simulated in the frontend.

---

## Flow 1: Home & Vault Selection

**Route:** `/`

**Component:** `HomeClient` (`components/home-client.tsx`)

1. User lands on the home page.
2. On first visit, a **demo vault** ("BTC Scalper Demo") is auto-initialized via `initDemoVault()` in `lib/store.ts`. It comes pre-populated with sample inventory, PnL history, audit events, and a simulated active market.
3. The home page displays:
   - A hero section with project branding.
   - A list of all existing vaults (from localStorage key `polyagents.vaults`).
   - A "Create Vault" call-to-action button.
4. User taps a vault card to navigate to `/vault/[id]` (the vault dashboard).
5. User taps "Create Vault" to navigate to `/vault/create`.

---

## Flow 2: Create Vault (5-Step Wizard)

**Route:** `/vault/create`

**Component:** `CreateVaultPage` (`app/vault/create/page.tsx`)

This is a 5-step wizard with a stepper UI at the top:

### Step 0 — Identity
- User enters a **vault name** (minimum 2 characters).
- User clicks **Privy Connect** (mocked via `PrivyConnectMock` component) to simulate wallet connection. In production, the real integration will use `@privy-io/react-auth` for multi-chain wallet authentication (email, social login, or wallet connect) providing instant testnet wallet creation with auto-funded Arc USDC, Hedera HBAR, and Polygon MATIC. Judges log in via email, see the deployed vault live in 30s with no MetaMask setup. For a live demo, you you need zero-friction UX — email login → funded wallet → scalping. No server setup, no DB setup, no seed/migration. For multi-vault/multi-operator support, a unified dashboard across all flows.
 Currently mocked — the real integration will use `@privy-io/react-auth` for multi-chain wallet authentication (email, social login, or wallet connect) providing instant testnet wallet creation with auto-funded Arc USDC, Hedera HBAR, and Polygon MATIC.
- Both fields must be filled to proceed.

### Step 1 — Strategy
- User configures strategy parameters via `StrategyForm`:
  - `bidPrice` — default $0.01 (the extreme-low passive buy price)
  - `sellPrice` — default $0.02 (the immediate flip sell target)
  - `maxCapital` — max USDC exposure cap
  - `trancheSize` — shares per order (default 15)
  - `noNewEntriesLast` — seconds before expiry to stop entering (default 30)
  - `keepSellAfter` — grace period for sell orders after expiry (default 10)
  - `aiEnabled` — toggle AI microstructure analysis
- Validation: sell price must be > bid price.

### Step 2 — Policy
- User chooses operating **mode**:
  - **Advisory** — AI recommends, operator approves each action manually.
  - **Auto** — Agent executes autonomously within strategy bounds.
- A JSON preview of the policy (name + mode + strategy) is shown.

### Step 3 — Funding
- User enters **USDC amount** to allocate (default $100).
- A summary shows USDC deposit + 1.0 HBAR reserve.

### Step 4 — Deploy
- User reviews a final summary table (name, mode, bid/sell, max capital, USDC).
- Clicking **"Deploy Vault"** triggers a simulated 8-stage deployment sequence:
  1. Minting HTS token
  2. Registering HCS topic
  3. Submitting strategy hash
  4. Funding vault
  5. Activating agent
  6. Provisioning order gateway
  7. Verifying policy
  8. Vault live!
- Each stage takes ~1 second (pure `setTimeout` simulation).
- A new `Vault` object is created with zeroed stats, the configured strategy, a random active market, and an initial audit event.
- The vault is persisted to `localStorage` via `saveVault()`.
- After deployment completes, user is auto-redirected to `/vault/[id]`.

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
6. **HCS Feed** — simulated Hedera Consensus Service message feed (`HCSFeed` component).
7. **Recent Activity** — last 5 audit events from the vault, with links to full audit trail.

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
   - Vault is updated in localStorage.
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
- The vault layout (`app/vault/[id]/layout.tsx`) reads the vault from localStorage by `[id]` param and passes it to both nav components.

---

## State Architecture

All flows depend on a single `Vault` type (`lib/types.ts`) persisted in `localStorage`:

| Key | Purpose |
|-----|---------|
| `polyagents.vaults` | Array of all `Vault` objects |
| `polyagents.selectedVaultId` | Currently selected vault ID |
| `polyagents.demoVaultCreated` | Flag to prevent re-creating the demo vault |

Key mutations are performed through helper functions in `lib/store.ts`:
- `saveVault()` / `getVaultById()` / `deleteVault()` — CRUD
- `addAuditEvent()` — prepend event (max 200)
- `updateVaultStats()` — increment cycles, accumulate PnL, update sparkline
- `initDemoVault()` — first-run seeding
