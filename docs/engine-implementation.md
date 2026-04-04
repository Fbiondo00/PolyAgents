# Engine Implementation Guide — Python → Next.js Server Actions

Maps the working Python engine (`ShareBot/Bitcoin5min/bot/`) to Next.js server actions for PolyAgents. Reference: `docs/engine-proposal.md` for the full Supabase spec.

**Deploy target:** Vercel (serverless functions + cron). **Durable execution:** [workflow.dev](https://useworkflow.dev). **On-chain settlement:** `VaultPilotMarket.sol` on Arc testnet.

---

## 0. Smart Contract Integration

### Deployed Contracts (Anvil Local)

The contracts are already implemented and tested locally:

| Contract | Address | Purpose |
|---|---|---|
| `MockUSDC` | `0x5FbDB2315678afecb367f032d93F642f64180aa3` | Testnet USDC (6 decimals, mintable) |
| `VaultPilotMarket` | `0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0` | Binary prediction market (213 lines) |

**Source:** `contracts/src/VaultPilotMarket.sol`

### Contract Interface

```solidity
// Key functions the engine interacts with:
function createMarket(string question, string category, uint256 resolutionTime,
                      string hederaTopicId, string policyHash) → uint256 marketId
function placeBet(uint256 marketId, bool isYes, uint256 amount)           // min 1 USDC
function resolveMarket(uint256 marketId, Outcome outcome)                 // 1=YES, 2=NO
function claimWinnings(uint256 marketId)                                  // 0.5% protocol fee
function getOdds(uint256 marketId) → (uint256 yesOdds, uint256 noOdds)   // in basis points
```

### TypeScript Client (viem)

```typescript
// lib/engine/adapters/vault-pilot-client.ts

import { createPublicClient, createWalletClient, http, parseUnits, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ARC_TESTNET = {
  id: 1120,
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
} as const;

// ABI subset — generate full ABI with: forge inspect VaultPilotMarket abi
const VAULTPILOT_ABI = [
  { name: "createMarket", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "question", type: "string" }, { name: "category", type: "string" },
      { name: "resolutionTime", type: "uint256" }, { name: "hederaTopicId", type: "string" },
      { name: "policyHash", type: "string" },
    ],
    outputs: [{ name: "", type: "uint256" }] },
  { name: "placeBet", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }, { name: "isYes", type: "bool" }, { name: "amount", type: "uint256" }],
    outputs: [] },
  { name: "resolveMarket", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }, { name: "outcome", type: "uint8" }],
    outputs: [] },
  { name: "claimWinnings", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }], outputs: [] },
  { name: "getOdds", type: "function", stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [{ name: "yesOdds", type: "uint256" }, { name: "noOdds", type: "uint256" }] },
] as const;

export function createVaultPilotClient(privateKey: `0x${string}`, contractAddress: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({ chain: ARC_TESTNET, transport: http() });
  const walletClient = createWalletClient({ chain: ARC_TESTNET, account, transport: http() });

  return {
    public: publicClient,
    wallet: walletClient,

    async createMarket(params: {
      question: string; category: string; resolutionTime: Date;
      hederaTopicId: string; policyHash: string;
    }) {
      const hash = await walletClient.writeContract({
        address: contractAddress, abi: VAULTPILOT_ABI, functionName: "createMarket",
        args: [params.question, params.category, BigInt(Math.floor(params.resolutionTime.getTime() / 1000)),
               params.hederaTopicId, params.policyHash],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { txHash: hash, marketId: receipt.logs[0]?.topics[1] ?? "0x0" };
    },

    async placeBet(marketId: bigint, isYes: boolean, amountUsdc: number) {
      const hash = await walletClient.writeContract({
        address: contractAddress, abi: VAULTPILOT_ABI, functionName: "placeBet",
        args: [marketId, isYes, parseUnits(amountUsdc.toString(), 6)],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    },

    async resolveMarket(marketId: bigint, outcomeYes: boolean) {
      const hash = await walletClient.writeContract({
        address: contractAddress, abi: VAULTPILOT_ABI, functionName: "resolveMarket",
        args: [marketId, outcomeYes ? 1 : 2],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    },

    async getOdds(marketId: bigint) {
      return publicClient.readContract({
        address: contractAddress, abi: VAULTPILOT_ABI, functionName: "getOdds",
        args: [marketId],
      }) as Promise<[bigint, bigint]>;
    },
  };
}
```

---

## 1. Architecture Overview

### Python → TypeScript Module Mapping

```
Python (ShareBot/Bitcoin5min)          TypeScript (PolyAgents)
─────────────────────────────          ─────────────────────────
bot/types.py                  →        lib/engine/types.ts + lib/engine/schemas.ts
bot/config.py                 →        lib/engine/config.ts
bot/exchange.py               →        lib/engine/adapters/polymarket-readonly.ts
                                       lib/engine/adapters/simulated-exchange.ts
bot/market_discovery.py       →        lib/engine/adapters/polymarket-readonly.ts
bot/ws.py                     →        lib/engine/websocket/ws-manager.ts
bot/engine.py                 →        lib/engine/strategy/engine.ts
bot/state_store.py            →        lib/engine/repositories/* (Supabase)
                                      (implicit — state machine lives in engine)
```

### Key Differences

| Concern | Python | Next.js |
|---|---|---|
| Main loop | `asyncio` 4Hz while-loop in `StrategyEngine._run_loop()` | `setInterval` on client calls server action, or Node cron |
| State persistence | `runtime_state.json` via `state_store.py` | Supabase tables (`polymarket_engine_runs`, `polymarket_virtual_orders`, etc.) |
| Exchange SDK | `py-clob-client` (Python) | `@polymarket/clob-client` (JS) or direct REST |
| WebSocket | `ws.py` — two threads (market + user) | `ws-manager.ts` — singleton, reconnect with backoff |
| Config | `config.yaml` + `.env` via Pydantic | `config.ts` via Zod + `process.env` |
| CLI | `rich` terminal UI | Next.js dashboard (existing UI) |
| Reconciliation | Every 2s, polls `get_order()` + `get_open_orders()` | Server action `reconcileRunState()`, same logic |
| Fill detection | WebSocket fill events + order polling | Simulated fills via `FillSimulator` in paper-trading mode |

### Data Flow

```
Client (setInterval 250ms)
  │
  ├─ POST server action: runEngineCycle(vaultId)
  │     │
  │     ├─ StrategyEngine.step(vaultId, now)
  │     │     ├─ checkMarketRoll()           ← Gamma API (discover + rollover)
  │     │     ├─ fillSim.checkFills()        ← deterministic rules vs book data
  │     │     ├─ cancelOppositeBuys()         ← if YES filled, cancel NO BUYs
  │     │     ├─ handleExpiry()              ← cancel BUYs at t=0, SELLs after grace
  │     │     ├─ placeEntries()              ← risk engine: passive, capital, max trades
  │     │     ├─ ensureSellCoverage()        ← oversell guard, passive SELL placement
  │     │     └─ reconcile()                 ← every N cycles, state consistency check
  │     ├─ computeRunPnL()                   ← realized + unrealized snapshot
  │     ├─ Persist to Supabase
  │     ├─ Mirror bet to VaultPilotMarket.sol on Arc (viem)
  │     ├─ Pay 0.001 HBAR → Hedera (agent micropayment)
  │     ├─ Log decision to HCS topic (immutable audit)
  │     └─ Update ENS text records (live stats)
  │
  └─ UI re-renders from Supabase realtime subscriptions

Vercel Cron (every 60s)
  │
  └─ GET /api/engine/cron/reconcile
        ├─ For each running vault: reconcileRunState()
        ├─ Update lastHeartbeatAt
        └─ Mark stale runs (no tick >60s) as potentially disconnected

Workflow.dev (durable, per vault)
  │
  └─ runStrategy(vaultId)  "use workflow"
        ├─ discoverMarket()  "use step"  ← Gamma API
        ├─ placeQuotes()     "use step"  ← risk engine + virtual orders
        ├─ sleep("4s")       ← durable, zero resource consumption
        ├─ checkFills()      "use step"  ← fill simulator
        ├─ handleExpiry()    "use step"  ← cancel + rollover
        └─ loop back to placeQuotes()
```

---

## 2. Type Definitions

**Source:** `bot/types.py`

```typescript
// lib/engine/types.ts

// ── Enums ──

export type MarketSide = "YES" | "NO";
export type OrderIntent = "BUY" | "SELL";
export type OrderStatus = "OPEN" | "PARTIAL" | "FILLED" | "CANCELLED" | "EXPIRED" | "REJECTED";
export type EngineState =
  | "IDLE"
  | "DISCOVERING_MARKET"
  | "SYNCING_MARKET"
  | "READY"
  | "QUOTING"
  | "HOLDING_INVENTORY"
  | "EXPIRY_GUARD"
  | "ROLLING_OVER"
  | "RECONCILING"
  | "PAUSED"
  | "ERROR";

export type FillReason =
  | "touched_price"
  | "crossed_top_of_book"
  | "expiry_close"
  | "manual_reconcile"
  | "replay_engine";

// ── Domain Entities ──

export interface ActiveMarket {
  conditionId: string;
  slug: string;
  question: string;
  yesTokenId: string;
  noTokenId: string;
  startTs: number;    // unix seconds
  endTs: number;      // unix seconds
  tickSize: number;
  minOrderSize: number;
}

export interface BookTop {
  bestBid: number | null;
  bestAsk: number | null;
}

export interface VirtualOrder {
  id: string;              // uuid
  engineRunId: string;
  marketId: string;
  side: MarketSide;
  intent: OrderIntent;
  tokenId: string;
  price: number;
  submittedQty: number;
  filledQty: number;
  remainingQty: number;
  status: OrderStatus;
  clientRef: string;       // e.g. "btc5m-buy-yes-1712..-a1b2c3d4"
  placedAt: number;        // unix ms
  expiresAt: number | null;
  simulated: boolean;
  rejectionReason: string | null;
}

export interface SideLedger {
  submittedBuyQty: number;
  filledBuyQty: number;
  openBuyQty: number;
  submittedSellQty: number;
  filledSellQty: number;
  openSellQty: number;
  unsoldInventory: number;
  realizedPnl: number;
  completedCycles: number;
}

export interface MarketState {
  market: ActiveMarket;
  sides: Record<MarketSide, SideLedger>;
  totalNewEntries: number;
  isExpired: boolean;
  buyCancelDone: boolean;
  sellCancelDone: boolean;
}

export interface EngineRun {
  id: string;
  vaultId: string;
  status: "running" | "stopped" | "paused" | "error";
  currentState: EngineState;
  activeMarketId: string | null;
  startedAt: number;
  stoppedAt: number | null;
  lastHeartbeatAt: number;
  lastError: string | null;
}

// ── Books map: tokenId → BookTop ──
export type Books = Record<string, BookTop>;
```

### Zod Schemas

**Source:** `bot/config.py` (Pydantic) + `engine-proposal.md` (strategy params)

```typescript
// lib/engine/schemas.ts

import { z } from "zod";

export const strategyConfigSchema = z.object({
  enabled: z.boolean().default(true),
  entryPrice: z.number().default(0.01),
  exitPrice: z.number().default(0.02),
  orderSize: z.number().default(10),
  maxCapitalUsdc: z.number().optional(),
  maxTradesPerMarket: z.number().int().default(50),
  maxTradesPolicy: z.enum(["side", "global"]).default("side"),
  noNewEntriesLastSeconds: z.number().int().default(10),
  keepSellOrdersAfterExpirySeconds: z.number().int().default(10),
  reconcileIntervalCycles: z.number().int().default(8), // every ~2s at 250ms cycle
  minSpreadRequired: z.number().optional(),
  strictPassiveOnly: z.boolean().default(true),
  allowBothSides: z.boolean().default(true),
  cancelOpenBuysOnExpiry: z.boolean().default(true),
  autoReentryEnabled: z.boolean().default(true),
});

export type StrategyConfig = z.infer<typeof strategyConfigSchema>;

export const engineStartSchema = z.object({
  vaultId: z.string().uuid(),
  configOverride: strategyConfigSchema.partial().optional(),
});

export const marketTickSchema = z.object({
  vaultId: z.string().uuid(),
  event: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("book"), assetId: z.string(), bestBid: z.number().nullable(), bestAsk: z.number().nullable() }),
    z.object({ kind: z.literal("fill"), orderId: z.string(), filledQty: z.number() }),
    z.object({ kind: z.literal("cancel"), orderId: z.string() }),
    z.object({ kind: z.literal("error"), message: z.string() }),
  ]),
});
```

---

## 3. Server Actions

Each action maps to a Python `StrategyEngine` method. All live under `app/actions/engine/`.

### 3.1 Engine Lifecycle

**Source:** `bot/engine.py` — `start()`, `stop()`, `_run_loop()`

```typescript
// app/actions/engine/lifecycle.ts
"use server";

import { strategyConfigSchema } from "@/lib/engine/schemas";
import { getStrategyConfig, createEngineRun, updateEngineRun } from "@/lib/engine/repositories";

export async function startEngine(vaultId: string, configOverride?: Partial<StrategyConfig>) {
  const config = strategyConfigSchema.parse({
    ...(await getStrategyConfig(vaultId)),
    ...configOverride,
  });

  const run = await createEngineRun({
    vaultId,
    status: "running",
    currentState: "DISCOVERING_MARKET",
    lastHeartbeatAt: Date.now(),
  });

  return { runId: run.id, config };
}

export async function stopEngine(vaultId: string) {
  // Cancel all open virtual orders
  // Update engine run status to "stopped"
  const run = await updateEngineRun(vaultId, { status: "stopped", stoppedAt: Date.now() });
  return run;
}

export async function pauseEngine(vaultId: string) {
  return updateEngineRun(vaultId, { status: "paused" });
}

export async function resumeEngine(vaultId: string) {
  return updateEngineRun(vaultId, { status: "running" });
}
```

### 3.2 Main Cycle (combines Python's `_run_loop`)

**Source:** `bot/engine.py:733` — the 4Hz main loop

```typescript
// app/actions/engine/cycle.ts
"use server";

import { runEngineStep } from "@/lib/engine/strategy/engine";
import { getEngineRun } from "@/lib/engine/repositories";

/**
 * Called by client setInterval (~250ms).
 * Mirrors Python's _run_loop(): market roll → events → expiry → entries → sells → reconcile.
 */
export async function runEngineCycle(vaultId: string) {
  const run = await getEngineRun(vaultId);
  if (!run || run.status !== "running") return null;

  try {
    const snapshot = await runEngineStep(vaultId, run);
    return snapshot;
  } catch (error) {
    // Safe-stop on fatal error (Python: logger.exception + self._running = False)
    await updateEngineRun(vaultId, {
      status: "error",
      currentState: "ERROR",
      lastError: String(error),
    });
    throw error;
  }
}
```

### 3.3 Market Discovery & Rollover

**Source:** `bot/engine.py` — `_check_market_roll()` + `bot/market_discovery.py` — `get_active_btc_5m_market()`

```typescript
// app/actions/engine/market.ts
"use server";

import { discoverActiveMarket } from "@/lib/engine/adapters/polymarket-readonly";

/**
 * Port of StrategyEngine._check_market_roll()
 * Two-phase discovery: deterministic slug lookup → fallback broad scan
 * If market changed, handle rollover (cancel old buys, schedule old sell cancel)
 */
export async function discoverAndRollMarket(vaultId: string) {
  const detected = await discoverActiveMarket();
  // Compare with current active market in engine run state
  // If different: unsubscribe old tokens, cancel old BUYs, schedule SELL cancel
  // Subscribe new tokens, reset MarketState, persist
  return detected; // ActiveMarket | null
}
```

### 3.4 Buy Quote Placement

**Source:** `bot/engine.py` — `_maybe_place_entries()`

```typescript
// app/actions/engine/entries.ts
"use server";

import { validateEntry } from "@/lib/engine/strategy/risk-engine";
import { createVirtualOrder } from "@/lib/engine/repositories";

/**
 * Port of StrategyEngine._maybe_place_entries()
 * Guard rails: expiry guard, filled-side stop, max trades, passive-only, capital cap
 * Places $0.01 BUY limit on both YES and NO if conditions pass
 */
export async function placeVirtualBuyQuotes(vaultId: string) {
  const run = await getEngineRun(vaultId);
  if (!run || run.status !== "running" || !run.activeMarketId) return [];

  const config = await getStrategyConfig(vaultId);
  const state = await getMarketState(vaultId);
  const books = await getCachedBooks(vaultId);
  const market = await getActiveMarket(vaultId);
  if (!state || !market) return [];

  const now = Math.floor(Date.now() / 1000);
  const toExpiry = market.endTs - now;
  if (toExpiry <= config.noNewEntriesLastSeconds) return [];

  // If any side already has a fill, don't place new entries
  const anyFilled = (["YES", "NO"] as const).some(
    (s) => state.sides[s].filledBuyQty > 0 || state.sides[s].unsoldInventory > 0
  );
  if (anyFilled && !config.allowBothSides) return [];

  const risk = new RiskEngine(config);
  const created: VirtualOrder[] = [];

  for (const side of ["YES", "NO"] as const) {
    const ledger = state.sides[side];
    const tokenId = side === "YES" ? market.yesTokenId : market.noTokenId;
    const book = books[tokenId] ?? { bestBid: null, bestAsk: null };

    // Max trades check
    if (!risk.canPlaceEntry(ledger, state, side, config)) continue;

    // Passive-only: BUY price must be < best_ask
    if (!risk.isPassivePrice(book, "BUY", config.entryPrice)) continue;

    // Tick size validation
    if (!risk.validateTickSize(config.entryPrice, market.tickSize)) continue;

    // Capital allocation check
    const committed = ledger.openBuyQty * config.entryPrice + ledger.unsoldInventory * config.entryPrice;
    const nextNotional = config.orderSize * config.entryPrice;
    if (config.maxCapitalUsdc !== undefined && (committed + nextNotional) > config.maxCapitalUsdc) continue;

    const clientRef = `btc5m-buy-${side.toLowerCase()}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    const order = await createVirtualOrder({
      engineRunId: run.id,
      marketId: market.conditionId,
      side,
      intent: "BUY",
      tokenId,
      price: config.entryPrice,
      submittedQty: config.orderSize,
      clientRef,
      simulated: true,
    });

    // Update ledger: submittedBuyQty, openBuyQty
    ledger.submittedBuyQty += config.orderSize;
    ledger.openBuyQty += config.orderSize;
    state.totalNewEntries++;

    created.push(order);
  }

  await saveMarketState(vaultId, state);
  return created;
}
```

### 3.5 Sell Coverage

**Source:** `bot/engine.py` — `_ensure_sell_coverage()`

```typescript
// app/actions/engine/exits.ts
"use server";

import { validateExit } from "@/lib/engine/strategy/risk-engine";

/**
 * Port of StrategyEngine._ensure_sell_coverage()
 * Oversell guard: if open_sell > inventory, emergency cancel all sells
 * Place virtual SELL at $0.02 for any unsold inventory not yet covered
 * Passive-only check: SELL price must be > best_bid
 */
export async function placeVirtualExitOrders(vaultId: string) {
  const run = await getEngineRun(vaultId);
  if (!run || run.status !== "running" || !run.activeMarketId) return;

  const config = await getStrategyConfig(vaultId);
  const state = await getMarketState(vaultId);
  const books = await getCachedBooks(vaultId);
  const market = await getActiveMarket(vaultId);
  if (!state || !market) return;

  const risk = new RiskEngine(config);
  const EPSILON = 1e-9;

  for (const side of ["YES", "NO"] as const) {
    const ledger = state.sides[side];
    const tokenId = side === "YES" ? market.yesTokenId : market.noTokenId;
    const book = books[tokenId] ?? { bestBid: null, bestAsk: null };

    // OVERSELL GUARD: if openSellQty exceeds inventory, emergency cancel all sells
    if (ledger.openSellQty > ledger.unsoldInventory + EPSILON) {
      const openSells = await getOpenOrdersForSide(vaultId, side, "SELL");
      for (const order of openSells) {
        await cancelVirtualOrder(vaultId, order.id);
        ledger.openSellQty -= order.remainingQty;
      }
      continue;
    }

    // Calculate how many sells are missing to cover inventory
    const missingSell = Math.max(0, ledger.unsoldInventory - ledger.openSellQty);
    if (missingSell < EPSILON) continue;

    // Passive-only: SELL price must be > best_bid
    if (!risk.isPassivePrice(book, "SELL", config.exitPrice)) continue;

    // Tick size validation
    if (!risk.validateTickSize(config.exitPrice, market.tickSize)) continue;

    const clientRef = `btc5m-sell-${side.toLowerCase()}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    await createVirtualOrder({
      engineRunId: run.id,
      marketId: market.conditionId,
      side,
      intent: "SELL",
      tokenId,
      price: config.exitPrice,
      submittedQty: missingSell,
      clientRef,
      simulated: true,
    });

    // Update ledger: submittedSellQty, openSellQty
    ledger.submittedSellQty += missingSell;
    ledger.openSellQty += missingSell;
  }

  await saveMarketState(vaultId, state);
}
```

### 3.6 Market Tick Processing

**Source:** `bot/engine.py` — `_consume_ws_events()`

```typescript
// app/actions/engine/tick.ts
"use server";

/**
 * Port of StrategyEngine._consume_ws_events()
 * Updates book top-of-book from WebSocket events
 * Triggers fill processing for fill events
 */
export async function processMarketTick(vaultId: string, event: MarketTickEvent) {
  if (event.kind === "book") {
    // Update books[event.assetId] with bestBid/bestAsk
    // Run fill simulator against new book data
    await checkForSimulatedFills(vaultId, event.assetId);
  } else if (event.kind === "fill") {
    await processSimulatedFill(vaultId, event.orderId, event.filledQty);
  } else if (event.kind === "cancel") {
    await cancelVirtualOrder(vaultId, event.orderId);
  }
}
```

### 3.7 Simulated Fill Processing

**Source:** `bot/engine.py` — `_apply_order_status()`

```typescript
// app/actions/engine/fills.ts
"use server";

/**
 * Port of StrategyEngine._apply_order_status()
 * Update order filledQty, update ledger:
 *   BUY fill  → unsoldInventory += delta
 *   SELL fill → unsoldInventory -= delta, realizedPnl += delta * (exitPrice - entryPrice)
 * If inventory depleted → completedCycles++
 */
export async function processSimulatedFill(vaultId: string, orderId: string, filledQty: number) {
  const order = await getVirtualOrder(orderId);
  if (!order || order.status === "CANCELLED" || order.status === "FILLED") return;

  const config = await getStrategyConfig(vaultId);
  const state = await getMarketState(vaultId);
  if (!state) return;

  const oldFilled = order.filledQty;
  const delta = filledQty - oldFilled;
  if (delta <= 0) return;

  // Update order state
  order.filledQty = filledQty;
  order.remainingQty = Math.max(0, order.submittedQty - filledQty);
  order.status = order.remainingQty < 1e-9 ? "FILLED" : "PARTIAL";

  const ledger = state.sides[order.side];
  const EPSILON = 1e-9;

  if (order.intent === "BUY") {
    ledger.filledBuyQty += delta;
    ledger.openBuyQty = Math.max(0, ledger.openBuyQty - delta);
    ledger.unsoldInventory += delta;
  } else {
    // SELL fill
    ledger.filledSellQty += delta;
    ledger.openSellQty = Math.max(0, ledger.openSellQty - delta);
    ledger.unsoldInventory -= delta;
    // Realized PnL: delta * (sellPrice - entryPrice)
    ledger.realizedPnl += delta * (order.price - config.entryPrice);
  }

  // Check if cycle completed: inventory fully sold on this side
  if (ledger.unsoldInventory <= EPSILON && ledger.filledBuyQty > 0 && ledger.filledSellQty > 0) {
    ledger.completedCycles++;
  }

  // Persist order and state updates
  await updateVirtualOrder(orderId, {
    filledQty: order.filledQty,
    remainingQty: order.remainingQty,
    status: order.status,
  });
  await saveMarketState(vaultId, state);

  // Create audit record for the fill
  await addAuditEvent(vaultId, {
    type: "SIMULATED_FILL",
    orderId,
    side: order.side,
    intent: order.intent,
    filledQty: delta,
    price: order.price,
    timestamp: Date.now(),
  });
}
```

### 3.8 Opposite Side Cancellation

**Source:** `bot/engine.py` — `_cancel_opposite_buys_on_fill()`

```typescript
// app/actions/engine/cancellation.ts
"use server";

/**
 * Port of StrategyEngine._cancel_opposite_buys_on_fill()
 * If YES filled → cancel NO BUYs. If NO filled → cancel YES BUYs.
 */
export async function cancelOppositeBuys(vaultId: string) {
  const state = await getMarketState(vaultId);
  if (!state) return;

  // Determine which sides have received fills
  const filledSides = new Set<string>();
  for (const side of ["YES", "NO"] as const) {
    if (state.sides[side].filledBuyQty > 0 || state.sides[side].unsoldInventory > 0) {
      filledSides.add(side);
    }
  }
  if (filledSides.size === 0) return;

  // Cancel BUY orders on the opposite side(s)
  for (const side of ["YES", "NO"] as const) {
    if (filledSides.has(side)) continue;
    if (state.sides[side].openBuyQty <= 0) continue;

    const openBuys = await getOpenOrdersForSide(vaultId, side, "BUY");
    for (const order of openBuys) {
      await cancelVirtualOrder(vaultId, order.id);
      state.sides[side].openBuyQty -= order.remainingQty;
    }
  }

  await saveMarketState(vaultId, state);
}
```

### 3.9 Expiry Handling

**Source:** `bot/engine.py` — `_handle_expiry()`

```typescript
// app/actions/engine/expiry.ts
"use server";

/**
 * Port of StrategyEngine._handle_expiry()
 * At t=0 (expiry): cancel all BUYs
 * At t=-keepSellOrdersAfterExpirySeconds: cancel all SELLs
 * Also handles pending old market sell cancellation (grace period from rollover)
 */
export async function handleMarketExpiry(vaultId: string) {
  const state = await getMarketState(vaultId);
  const market = await getActiveMarket(vaultId);
  if (!state || !market) return;

  const config = await getStrategyConfig(vaultId);
  const now = Math.floor(Date.now() / 1000);

  // Handle pending old market sell cancellations (from previous rollover)
  if (state.pendingOldMarketId) {
    const oldMarket = await getMarketById(state.pendingOldMarketId);
    const graceExpired = now > (oldMarket?.endTs ?? 0) + config.keepSellOrdersAfterExpirySeconds;
    if (graceExpired) {
      const oldSells = await getOpenOrdersForMarket(vaultId, state.pendingOldMarketId, "SELL");
      for (const order of oldSells) {
        await cancelVirtualOrder(vaultId, order.id);
      }
      state.pendingOldMarketId = null;
    }
  }

  const toExpiry = market.endTs - now;

  // At expiry (t=0): cancel all BUY orders
  if (toExpiry <= 0 && !state.buyCancelDone) {
    state.isExpired = true;

    for (const side of ["YES", "NO"] as const) {
      const openBuys = await getOpenOrdersForSide(vaultId, side, "BUY");
      for (const order of openBuys) {
        await cancelVirtualOrder(vaultId, order.id);
        state.sides[side].openBuyQty -= order.remainingQty;
      }
    }
    state.buyCancelDone = true;

    await addAuditEvent(vaultId, {
      type: "MARKET_EXPIRED",
      marketId: market.conditionId,
      timestamp: Date.now(),
    });
  }

  // After grace period: cancel all remaining SELL orders
  if (toExpiry <= -config.keepSellOrdersAfterExpirySeconds && !state.sellCancelDone) {
    for (const side of ["YES", "NO"] as const) {
      const openSells = await getOpenOrdersForSide(vaultId, side, "SELL");
      for (const order of openSells) {
        await cancelVirtualOrder(vaultId, order.id);
        state.sides[side].openSellQty -= order.remainingQty;
      }
    }
    state.sellCancelDone = true;

    await addAuditEvent(vaultId, {
      type: "SELL_CANCEL_POST_EXPIRY",
      marketId: market.conditionId,
      timestamp: Date.now(),
    });
  }

  await saveMarketState(vaultId, state);
}
```

### 3.10 Reconciliation

**Source:** `bot/engine.py` — `_reconcile_orders()`

```typescript
// app/actions/engine/reconcile.ts
"use server";

/**
 * Port of StrategyEngine._reconcile_orders()
 * Sync tracked virtual orders with actual exchange state
 * Re-discover orders placed elsewhere (restart recovery)
 * Recompute open_qty from actual order state
 */
export async function reconcileRunState(vaultId: string, force = false) {
  const run = await getEngineRun(vaultId);
  if (!run) return;

  const state = await getMarketState(vaultId);
  const config = await getStrategyConfig(vaultId);
  if (!state) return;

  // 1. Get all tracked virtual orders for this engine run
  const trackedOrders = await getOrdersForRun(run.id);

  // 2. For each tracked order, check against exchange (in live mode)
  //    In simulation mode, verify internal consistency
  for (const order of trackedOrders) {
    if (order.status !== "OPEN" && order.status !== "PARTIAL") continue;

    // Simulated exchange: just verify state consistency
    const expectedRemaining = order.submittedQty - order.filledQty;
    if (Math.abs(expectedRemaining - order.remainingQty) > 1e-9) {
      // State drift detected — recompute
      const delta = order.filledQty - (order.submittedQty - order.remainingQty);
      order.remainingQty = expectedRemaining;

      const ledger = state.sides[order.side];
      if (order.intent === "BUY") {
        ledger.openBuyQty = Math.max(0, ledger.openBuyQty - delta);
      } else {
        ledger.openSellQty = Math.max(0, ledger.openSellQty - delta);
      }
    }

    // In live mode: poll the exchange for actual order state
    // const exchangeOrder = await exchangeAdapter.getOrder(order.clientRef);
    // if (!exchangeOrder) { order.status = "EXPIRED"; continue; }
    // const newFilled = exchangeOrder.filledQty;
    // if (newFilled !== order.filledQty) {
    //   await processSimulatedFill(vaultId, order.id, newFilled);
    // }
  }

  // 3. Discover orphaned orders (placed but not tracked — restart recovery)
  // In live mode: query exchange for open orders with our client_ref prefix
  // const exchangeOrders = await exchangeAdapter.getOpenOrders();
  // for (const exOrder of exchangeOrders) {
  //   if (!exOrder.clientRef.startsWith("btc5m-")) continue;
  //   const alreadyTracked = trackedOrders.some(o => o.clientRef === exOrder.clientRef);
  //   if (!alreadyTracked) {
  //     await createVirtualOrder({ ...exOrder, engineRunId: run.id });
  //   }
  // }

  // 4. Recompute openQty from authoritative order state
  for (const side of ["YES", "NO"] as const) {
    const ledger = state.sides[side];
    const sideOrders = trackedOrders.filter((o) => o.side === side);

    ledger.openBuyQty = sideOrders
      .filter((o) => o.intent === "BUY" && (o.status === "OPEN" || o.status === "PARTIAL"))
      .reduce((sum, o) => sum + o.remainingQty, 0);

    ledger.openSellQty = sideOrders
      .filter((o) => o.intent === "SELL" && (o.status === "OPEN" || o.status === "PARTIAL"))
      .reduce((sum, o) => sum + o.remainingQty, 0);
  }

  // 5. Persist reconciliation record
  await saveMarketState(vaultId, state);
  await updateEngineRun(vaultId, { lastHeartbeatAt: Date.now() });

  await addAuditEvent(vaultId, {
    type: "RECONCILIATION",
    ordersChecked: trackedOrders.length,
    timestamp: Date.now(),
  });
}
```

### 3.11 PnL Computation

**Source:** `bot/engine.py` — implicit in `_log_periodic_status()`

```typescript
// app/actions/engine/pnl.ts
"use server";

/**
 * Port of StrategyEngine._log_periodic_status() PnL computation
 * Snapshot: realized PnL, unrealized PnL, inventory cost, open orders notional
 */
export async function computeRunPnL(vaultId: string) {
  const run = await getEngineRun(vaultId);
  if (!run) return null;

  const state = await getMarketState(vaultId);
  const config = await getStrategyConfig(vaultId);
  const books = await getCachedBooks(vaultId);
  const market = await getActiveMarket(vaultId);
  if (!state || !config) return null;

  let totalRealizedPnl = 0;
  let totalUnrealizedPnl = 0;
  let totalInventoryCost = 0;
  let totalOpenNotional = 0;
  let totalCompletedCycles = 0;

  const sideBreakdown: Record<string, {
    realizedPnl: number;
    unrealizedPnl: number;
    inventoryCost: number;
    openNotional: number;
    unsoldInventory: number;
  }> = {};

  for (const side of ["YES", "NO"] as const) {
    const ledger = state.sides[side];
    const tokenId = side === "YES" ? market?.yesTokenId : market?.noTokenId;
    const book = tokenId ? books[tokenId] : null;

    // Realized PnL from completed cycles
    const realizedPnl = ledger.realizedPnl;

    // Unrealized PnL: value of unsold inventory at current market price vs cost
    let unrealizedPnl = 0;
    const inventoryCost = ledger.unsoldInventory * config.entryPrice;
    if (ledger.unsoldInventory > 0 && book) {
      const midPrice = book.bestBid !== null && book.bestAsk !== null
        ? (book.bestBid + book.bestAsk) / 2
        : book.bestAsk ?? config.exitPrice; // Fallback to exit price if no bid
      const avgCost = config.entryPrice; // All entries at same price
      unrealizedPnl = ledger.unsoldInventory * (midPrice - avgCost);
    }

    // Open orders notional capital commitment
    const openNotional = ledger.openBuyQty * config.entryPrice + ledger.openSellQty * config.exitPrice;

    totalRealizedPnl += realizedPnl;
    totalUnrealizedPnl += unrealizedPnl;
    totalInventoryCost += inventoryCost;
    totalOpenNotional += openNotional;
    totalCompletedCycles += ledger.completedCycles;

    sideBreakdown[side] = { realizedPnl, unrealizedPnl, inventoryCost, openNotional, unsoldInventory: ledger.unsoldInventory };
  }

  const snapshot = {
    vaultId,
    runId: run.id,
    totalRealizedPnl,
    totalUnrealizedPnl,
    totalPnl: totalRealizedPnl + totalUnrealizedPnl,
    totalInventoryCost,
    totalOpenNotional,
    totalCompletedCycles,
    sideBreakdown,
    computedAt: Date.now(),
  };

  // Persist PnL snapshot for time-series charting
  await savePnlSnapshot(snapshot);

  return snapshot;
}
```

---

## 4. Strategy Engine

**Source:** `bot/engine.py` — the core 733-line file

```typescript
// lib/engine/strategy/engine.ts

import type { ActiveMarket, Books, MarketState, SideLedger, EngineRun, VirtualOrder, StrategyConfig } from "../types";
import { discoverActiveMarket } from "../adapters/polymarket-readonly";
import { FillSimulator } from "./fill-simulator";
import { RiskEngine } from "./risk-engine";

export class StrategyEngine {
  private config: StrategyConfig;
  private activeMarket: ActiveMarket | null = null;
  private state: MarketState | null = null;
  private orders: Map<string, VirtualOrder> = new Map();
  private books: Books = {};
  private fillSim: FillSimulator;
  private risk: RiskEngine;
  private cycleCount = 0;

  constructor(config: StrategyConfig) {
    this.config = config;
    this.fillSim = new FillSimulator(config);
    this.risk = new RiskEngine(config);
  }

  /**
   * Main entry point. Called by runEngineCycle server action.
   * Mirrors Python _run_loop() — one iteration per call.
   */
  async step(vaultId: string, now: number): Promise<EngineSnapshot> {
    await this.checkMarketRoll(vaultId, now);
    this.fillSim.checkFills(this.books, this.orders, this.state, now);
    await this.cancelOppositeBuys(vaultId);
    await this.handleExpiry(vaultId, now);
    await this.placeEntries(vaultId, now);
    await this.ensureSellCoverage(vaultId);
    this.cycleCount++;
    if (this.cycleCount % this.config.reconcileIntervalCycles === 0) {
      await this.reconcile(vaultId);
    }
    return this.snapshot();
  }

  // ── Market Discovery (Python: _check_market_roll) ──
  async checkMarketRoll(vaultId: string, now: number) {
    const detected = await discoverActiveMarket(now);
    if (!detected) return;

    if (this.activeMarket?.conditionId === detected.conditionId) return;

    const previous = this.activeMarket;
    this.activeMarket = detected;
    this.state = this.createFreshState(detected);
    this.books = { [detected.yesTokenId]: { bestBid: null, bestAsk: null }, [detected.noTokenId]: { bestBid: null, bestAsk: null } };

    // TODO: subscribe WebSocket, unsubscribe previous, cancel old buys, schedule old sell cancel
  }

  // ── Entry Logic (Python: _maybe_place_entries) ──
  async placeEntries(vaultId: string, now: number) {
    if (!this.state || !this.activeMarket) return;
    const toExpiry = this.activeMarket.endTs - now;
    if (toExpiry <= this.config.noNewEntriesLastSeconds) return;

    const anyFilled = this.isAnySideFilled();
    if (anyFilled) return;

    for (const side of ["YES", "NO"] as const) {
      const ledger = this.state.sides[side];
      const tokenId = side === "YES" ? this.activeMarket.yesTokenId : this.activeMarket.noTokenId;

      if (!this.risk.canPlaceEntry(ledger, this.state, side, this.config)) continue;
      if (!this.risk.isPassivePrice(this.books[tokenId], "BUY", this.config.entryPrice)) continue;

      // Place virtual BUY order at config.entryPrice
      // this.orders.set(orderId, newOrder);
      // Persist to Supabase
    }
  }

  // ── Sell Coverage (Python: _ensure_sell_coverage) ──
  async ensureSellCoverage(vaultId: string) {
    if (!this.state || !this.activeMarket) return;

    for (const side of ["YES", "NO"] as const) {
      const ledger = this.state.sides[side];
      const tokenId = side === "YES" ? this.activeMarket.yesTokenId : this.activeMarket.noTokenId;

      // Oversell guard
      if (ledger.openSellQty > ledger.unsoldInventory + 1e-9) {
        // Emergency: cancel all sells for this side
        continue;
      }

      const missing = Math.max(0, ledger.unsoldInventory - ledger.openSellQty);
      if (missing < 1e-9) continue;
      if (!this.risk.isPassivePrice(this.books[tokenId], "SELL", this.config.exitPrice)) continue;

      // Place virtual SELL order at config.exitPrice
    }
  }

  // ── Opposite Side Cancel (Python: _cancel_opposite_buys_on_fill) ──
  async cancelOppositeBuys(vaultId: string) {
    if (!this.state) return;
    const filledSides = new Set<string>();
    for (const side of ["YES", "NO"] as const) {
      if (this.state.sides[side].filledBuyQty > 0 || this.state.sides[side].unsoldInventory > 0) {
        filledSides.add(side);
      }
    }
    if (filledSides.size === 0) return;

    for (const side of ["YES", "NO"] as const) {
      if (!filledSides.has(side) && this.state.sides[side].openBuyQty > 0) {
        // Cancel all OPEN BUY orders for this side
      }
    }
  }

  // ── Expiry (Python: _handle_expiry) ──
  async handleExpiry(vaultId: string, now: number) {
    if (!this.state || !this.activeMarket) return;
    const toExpiry = this.activeMarket.endTs - now;

    if (toExpiry <= 0 && !this.state.buyCancelDone) {
      this.state.isExpired = true;
      // Cancel all OPEN BUY orders
      this.state.buyCancelDone = true;
    }
    if (toExpiry <= -this.config.keepSellOrdersAfterExpirySeconds && !this.state.sellCancelDone) {
      // Cancel all OPEN SELL orders
      this.state.sellCancelDone = true;
    }
  }

  // ── Helpers ──
  private isAnySideFilled(): boolean {
    if (!this.state) return false;
    return ["YES", "NO"].some(
      (s) => this.state!.sides[s as MarketSide].filledBuyQty > 0 || this.state!.sides[s as MarketSide].unsoldInventory > 0
    );
  }

  private createFreshState(market: ActiveMarket): MarketState {
    return {
      market,
      sides: {
        YES: { submittedBuyQty: 0, filledBuyQty: 0, openBuyQty: 0, submittedSellQty: 0, filledSellQty: 0, openSellQty: 0, unsoldInventory: 0, realizedPnl: 0, completedCycles: 0 },
        NO:  { submittedBuyQty: 0, filledBuyQty: 0, openBuyQty: 0, submittedSellQty: 0, filledSellQty: 0, openSellQty: 0, unsoldInventory: 0, realizedPnl: 0, completedCycles: 0 },
      },
      totalNewEntries: 0,
      isExpired: false,
      buyCancelDone: false,
      sellCancelDone: false,
    };
  }

  private snapshot(): EngineSnapshot {
    return {
      activeMarket: this.activeMarket,
      orders: Object.fromEntries(this.orders),
      marketState: this.state,
      books: this.books,
    };
  }
}
```

---

## 5. Fill Simulator

**Source:** `engine-proposal.md` fill simulation rules + `bot/engine.py` — implicit in reconciliation

```typescript
// lib/engine/strategy/fill-simulator.ts

import type { Books, MarketState, VirtualOrder, FillReason, StrategyConfig } from "../types";

export class FillSimulator {
  constructor(private config: StrategyConfig) {}

  /**
   * Check if any virtual BUY orders should be simulated as filled
   * based on deterministic book-level rules. Called every tick.
   *
   * Rules (from engine-proposal.md):
   * - touched_price: market price touched or went below BUY price
   * - crossed_top_of_book: best_ask crossed our BUY price
   * - expiry_close: market closed and we still hold position
   * - manual_reconcile: operator triggered
   * - replay_engine: historical replay
   */
  checkFills(books: Books, orders: Map<string, VirtualOrder>, state: MarketState | null, now: number) {
    for (const [id, order] of orders) {
      if (order.intent !== "BUY" || order.status !== "OPEN") continue;

      const book = books[order.tokenId];
      if (!book) continue;

      let fillReason: FillReason | null = null;

      // Rule 1: touched_price — best_ask <= our BUY price
      if (book.bestAsk !== null && book.bestAsk <= order.price) {
        fillReason = "touched_price";
      }
      // Rule 2: crossed_top_of_book — best_bid <= our BUY price
      else if (book.bestBid !== null && book.bestBid <= order.price) {
        fillReason = "crossed_top_of_book";
      }
      // Rule 3: expiry_close — market expired and order still open
      if (state?.isExpired && order.status === "OPEN") {
        fillReason = "expiry_close";
      }

      if (fillReason) {
        this.simulateFill(id, order, state, fillReason);
      }
    }
  }

  private simulateFill(orderId: string, order: VirtualOrder, state: MarketState | null, reason: FillReason) {
    // Mark order as FILLED
    // Update ledger: filledBuyQty += order.remainingQty, unsoldInventory += order.remainingQty
    // Create VirtualFill record with fill_reason
  }
}
```

---

## 6. Risk Engine

**Source:** `bot/engine.py` — guards in `_maybe_place_entries()` and `_ensure_sell_coverage()`

```typescript
// lib/engine/strategy/risk-engine.ts

import type { BookTop, MarketSide, MarketState, SideLedger, StrategyConfig } from "../types";

export class RiskEngine {
  constructor(private config: StrategyConfig) {}

  /** All entry checks combined. Returns true if entry is allowed. */
  canPlaceEntry(ledger: SideLedger, state: MarketState, side: MarketSide, config: StrategyConfig): boolean {
    // Max trades per market
    if (config.maxTradesPolicy === "side") {
      if (ledger.completedCycles >= config.maxTradesPerMarket) return false;
    } else {
      if (state.totalNewEntries >= config.maxTradesPerMarket) return false;
    }

    // Already have open BUYs
    if (ledger.openBuyQty > 0) return false;

    // Have unsold inventory
    if (ledger.unsoldInventory > 0) return false;

    // Capital allocation check
    const committed = ledger.openBuyQty * config.entryPrice + ledger.unsoldInventory * config.entryPrice;
    const nextNotional = config.orderSize * config.entryPrice;
    if (config.maxCapitalUsdc !== undefined && (committed + nextNotional) > config.maxCapitalUsdc) {
      return false;
    }

    return true;
  }

  /** Passive-only check. BUY must be below best_ask. SELL must be above best_bid. */
  isPassivePrice(book: BookTop, intent: "BUY" | "SELL", price: number): boolean {
    if (!this.config.strictPassiveOnly) return true;

    if (intent === "BUY") {
      if (book.bestAsk === null) return true; // No ask → assume passive
      return price < book.bestAsk;
    }
    if (intent === "SELL") {
      if (book.bestBid === null) return false; // No bid → can't sell passively
      return price > book.bestBid;
    }
    return false;
  }

  /** Tick size validation. Port of ExchangeClient.validate_price() */
  validateTickSize(price: number, tickSize: number): boolean {
    const steps = Math.round(price / tickSize);
    return Math.abs(steps * tickSize - price) < 1e-9;
  }

  /** Oversell prevention. Returns true if safe to place sell. */
  isOversellSafe(openSellQty: number, unsoldInventory: number): boolean {
    return openSellQty <= unsoldInventory + 1e-9;
  }

  /** Duplicate order prevention. */
  isDuplicate(ledger: SideLedger): boolean {
    return ledger.openBuyQty > 0;
  }

  /** Stale market guard. */
  isMarketStale(activeMarket: { endTs: number }, now: number): boolean {
    return now > activeMarket.endTs + 60; // 60s grace
  }
}
```

---

## 7. Exchange Adapters

### 7.1 Polymarket Read-Only Adapter

**Source:** `bot/exchange.py` + `bot/market_discovery.py`

```typescript
// lib/engine/adapters/polymarket-readonly.ts

const GAMMA_BASE = "https://gamma-api.polymarket.com";
const CLOB_BASE = "https://clob.polymarket.com";

export interface PolymarketMarket {
  conditionId: string;
  slug: string;
  question: string;
  yesTokenId: string;
  noTokenId: string;
  startTs: number;
  endTs: number;
  tickSize: number;
}

/**
 * Port of MarketDiscoveryService.get_active_btc_5m_market()
 * Two-phase: deterministic slug lookup → fallback broad scan
 */
export async function discoverActiveMarket(now?: number): Promise<PolymarketMarket | null> {
  const ts = now ?? Date.now() / 1000;

  // Phase 1: Deterministic slug lookup
  // Generate candidate slugs for current ± 1 five-minute windows
  const windowSize = 300; // 5 minutes in seconds
  const candidates = [-1, 0, 1].map((offset) => {
    const windowTs = Math.floor(ts / windowSize) * windowSize + offset * windowSize;
    return `btc-updown-5m-${windowTs}`;
  });

  for (const slug of candidates) {
    try {
      const res = await fetch(`${GAMMA_BASE}/markets?slug=${slug}&active=true&closed=false`);
      const data = await res.json();
      if (data.length > 0) {
        return parsePolymarketMarket(data[0]);
      }
    } catch { /* continue */ }
  }

  // Phase 2: Fallback broad scan
  try {
    const res = await fetch(`${GAMMA_BASE}/markets?active=true&closed=false&limit=100`);
    const data: any[] = await res.json();
    const keywords = ["bitcoin", "up", "down", "5"];

    for (const m of data) {
      const text = `${m.question ?? ""} ${m.slug ?? ""}`.toLowerCase();
      if (keywords.every((k) => text.includes(k)) && text.includes("min")) {
        return parsePolymarketMarket(m);
      }
    }
  } catch { /* no market found */ }

  return null;
}

function parsePolymarketMarket(raw: any): PolymarketMarket | null {
  const tokens: string[] = raw.clobTokenIds ?? [];
  const outcomes: string[] = raw.outcomes ?? [];
  const yesIdx = outcomes.findIndex((o: string) => o.toUpperCase() === "YES");
  const noIdx = outcomes.findIndex((o: string) => o.toUpperCase() === "NO");
  if (yesIdx === -1 || noIdx === -1 || !tokens[yesIdx] || !tokens[noIdx]) return null;

  return {
    conditionId: raw.conditionId ?? "",
    slug: raw.slug ?? "",
    question: raw.question ?? "",
    yesTokenId: tokens[yesIdx],
    noTokenId: tokens[noIdx],
    startTs: new Date(raw.startDate ?? raw.created_at).getTime() / 1000,
    endTs: new Date(raw.endDate ?? raw.closeTime).getTime() / 1000,
    tickSize: parseFloat(raw.tickSize ?? "0.01"),
  };
}

/**
 * Port of ExchangeClient.get_top_of_book()
 */
export async function getTopOfBook(tokenId: string): Promise<{ bestBid: number | null; bestAsk: number | null }> {
  const res = await fetch(`${CLOB_BASE}/book?token_id=${tokenId}`);
  const data = await res.json();
  const bids = data.bids ?? [];
  const asks = data.asks ?? [];
  return {
    bestBid: bids.length > 0 ? parseFloat(bids[0].price) : null,
    bestAsk: asks.length > 0 ? parseFloat(asks[0].price) : null,
  };
}

/**
 * Port of ExchangeClient.get_tick_size()
 */
export async function getTickSize(tokenId: string): Promise<number> {
  const res = await fetch(`${CLOB_BASE}/tick-size?token_id=${tokenId}`);
  const data = await res.json();
  return parseFloat(data.minimum_tick_size ?? data ?? "0.01");
}
```

### 7.2 Simulated Exchange Adapter

**Source:** `bot/exchange.py` — order management (paper-trading mode)

```typescript
// lib/engine/adapters/simulated-exchange.ts

import type { VirtualOrder, MarketSide, OrderIntent } from "../types";

export class SimulatedExchangeAdapter {
  private orders: Map<string, VirtualOrder> = new Map();

  async placeOrder(params: {
    tokenId: string;
    side: MarketSide;
    intent: OrderIntent;
    price: number;
    size: number;
    clientRef: string;
  }): Promise<VirtualOrder> {
    const order: VirtualOrder = {
      id: crypto.randomUUID(),
      engineRunId: "",
      marketId: "",
      side: params.side,
      intent: params.intent,
      tokenId: params.tokenId,
      price: params.price,
      submittedQty: params.size,
      filledQty: 0,
      remainingQty: params.size,
      status: "OPEN",
      clientRef: params.clientRef,
      placedAt: Date.now(),
      expiresAt: null,
      simulated: true,
      rejectionReason: null,
    };
    this.orders.set(order.id, order);
    return order;
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    const order = this.orders.get(orderId);
    if (order && order.status === "OPEN") {
      order.status = "CANCELLED";
      order.remainingQty = 0;
      return true;
    }
    return false;
  }

  async getOpenOrders(): Promise<VirtualOrder[]> {
    return [...this.orders.values()].filter((o) => o.status === "OPEN" || o.status === "PARTIAL");
  }
}
```

---

## 8. Vercel Cron + API Routes

Vercel supports cron triggers via `vercel.json`. The engine tick runs as a serverless API route, replacing Python's in-process asyncio loop.

### vercel.json

```json
{
  "crons": [
    {
      "path": "/api/engine/cron/reconcile",
      "schedule": "* * * * *"
    }
  ]
}
```

**Note:** Vercel Hobby minimum cron interval is 1 minute. For sub-second ticks (250ms), the client drives the loop via `setInterval` → server action. The Vercel cron handles reconciliation and heartbeat as a safety net.

### API Routes

```typescript
// app/api/engine/cron/reconcile/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  // 1. Query all running engine runs from Supabase
  // 2. For each: call reconcileRunState(vaultId)
  // 3. Update lastHeartbeatAt
  // 4. If heartbeat stale (>60s with no tick), mark as potentially disconnected
  return NextResponse.json({ reconciled: 0, timestamp: Date.now() });
}
```

```typescript
// app/api/engine/cron/tick/route.ts
// Alternative: if using Vercel Pro with 1s cron, drive the engine tick here
export async function GET() {
  // For each running vault: runEngineCycle(vaultId)
  // This is the "serverless tick" path — no client required
  return NextResponse.json({ ticked: 0 });
}
```

### Tick Scheduling Strategy

| Path | Frequency | Purpose |
|---|---|---|
| Client `setInterval` → server action | ~250ms | Real-time engine ticks while user has dashboard open |
| Vercel cron `/api/engine/cron/reconcile` | Every 60s | Reconciliation + heartbeat (survives client disconnect) |
| workflow.dev `runStrategy` | Continuous | Durable strategy execution (see Section 9) |

For the hackathon: client-driven ticks are sufficient. The Vercel cron provides a fallback if the user closes their browser.

---

## 9. workflow.dev — Durable Strategy Execution

[workflow.dev](https://useworkflow.dev) provides durable workflows that survive serverless cold starts and Vercel redeploys. The strategy engine becomes a long-running workflow with steps and durable sleeps.

### Install

```bash
npm install @useworkflow/devkit
```

### Strategy as a Workflow

```typescript
// lib/engine/workflows/strategy.ts

import { sleep, FatalError } from "workflow";

// ── Steps (each has full Node.js access) ──

async function discoverMarket(vaultId: string) {
  "use step";
  const market = await discoverActiveMarket(Date.now() / 1000);
  if (!market) throw new FatalError("No active BTC 5M market found");
  // Persist market to Supabase, subscribe WebSocket
  return market;
}

async function placeQuotes(vaultId: string, market: ActiveMarket) {
  "use step";
  // Fetch current book, run risk checks, place virtual BUY orders
  const books: Books = {};
  for (const tokenId of [market.yesTokenId, market.noTokenId]) {
    books[tokenId] = await getTopOfBook(tokenId);
  }
  // ... placeVirtualBuyQuotes logic ...
  return { books, ordersPlaced: true };
}

async function checkFills(vaultId: string) {
  "use step";
  // Run fill simulator against current book data
  // Update inventory ledger in Supabase
  // If fills detected → trigger sell coverage step
  return { fillsProcessed: 0 };
}

async function handleExpiry(vaultId: string, market: ActiveMarket) {
  "use step";
  const now = Date.now() / 1000;
  const toExpiry = market.endTs - now;

  if (toExpiry <= 0) {
    // Cancel all open BUYs, schedule SELL cancel after grace period
    await sleep(`${10}s`); // Durable sleep for grace period — no resource consumption
    // Cancel remaining SELLs
    return { expired: true };
  }
  return { expired: false };
}

async function rollover(vaultId: string, oldMarket: ActiveMarket) {
  "use step";
  // Discover next market, reset state, persist rollover event
  const next = await discoverActiveMarket(Date.now() / 1000);
  if (!next) throw new FatalError("No next market for rollover");
  return next;
}

// ── Orchestrator ──

export async function runStrategy(vaultId: string) {
  "use workflow";

  let market = await discoverMarket(vaultId);

  while (true) {
    // Place quotes at $0.01 on both sides
    await placeQuotes(vaultId, market);

    // Durable sleep between ticks — doesn't consume resources
    await sleep("4s");

    // Check for simulated fills
    const { fillsProcessed } = await checkFills(vaultId);

    // Handle market expiry
    const { expired } = await handleExpiry(vaultId, market);
    if (expired) {
      market = await rollover(vaultId, market);
    }

    // Reconcile every 8 cycles (~32s)
    // (workflow.dev handles this implicitly via step isolation)
  }
}
```

### Why workflow.dev

| Feature | Benefit for PolyAgents |
|---|---|
| `sleep("4s")` — durable, no-resource | Engine pauses between ticks without burning Vercel function time |
| `"use step"` isolation | Each step is individually retried on failure |
| Survives cold starts | Workflow state persists across Vercel redeploys |
| `FatalError` | Clean termination when no market found |
| `npx workflow web` | Local dev UI to inspect workflow runs, steps, timing |

### Integration Point

```typescript
// app/actions/engine/lifecycle.ts — modified startEngine
"use server";

import { runStrategy } from "@/lib/engine/workflows/strategy";

export async function startEngine(vaultId: string) {
  // Instead of client-driven setInterval, start the workflow:
  const workflowRun = await runStrategy(vaultId); // non-blocking — returns immediately
  return { workflowRunId: workflowRun.id };
}
```

---

## 10. Key Differences from Python

### Asyncio Loop → Hybrid (Client Ticks + Vercel Cron + workflow.dev)
Python runs a tight 4Hz `asyncio` while-loop. In Next.js, three mechanisms combine:
1. **Client `setInterval`** (250ms) → server action ticks for real-time UI updates
2. **Vercel cron** (every 60s) → reconciliation + heartbeat fallback
3. **workflow.dev** → durable strategy execution that survives serverless limitations

### On-Chain Settlement via VaultPilotMarket.sol
Python uses `py-clob-client` for direct Polymarket CLOB trading. PolyAgents adds an on-chain layer: bets are mirrored to `VaultPilotMarket.sol` on Arc testnet via viem, with USDC as the gas token. This satisfies the Arc "Best Prediction Markets" bounty.

### State Persistence
Python writes `runtime_state.json` on every loop iteration. Next.js writes to Supabase tables. The engine re-loads state at the start of each cycle. workflow.dev adds its own step-level persistence.

### Fill Detection
Python detects fills via WebSocket fill events + order polling. In simulation mode, the `FillSimulator` applies deterministic rules. For live mode, `@polymarket/clob-client` provides real fill detection.

### CLOB SDK
Python uses `py-clob-client`. TypeScript uses `@polymarket/clob-client` (live) or `SimulatedExchangeAdapter` (paper trading). The adapter pattern keeps both behind the same interface.

### Recovery
Python restores from `runtime_state.json` + exchange queries. Next.js restores from Supabase + exchange queries + workflow.dev state. The `reconcileRunState()` action handles this, and Vercel cron triggers it every 60s as a safety net.

### Hedera + ENS Integration
Each engine cycle also:
1. Pays 0.001 HBAR before LLM calls (Hedera `TransferTransaction`)
2. Logs decisions to per-vault HCS topic (immutable audit trail)
3. Updates ENS text records with live agent stats (flips, PnL, mode)

These are called as side-effects within the strategy workflow steps, not as separate loops.
