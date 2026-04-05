# Pietro -- Hackathon Task List

**Scope:** Arc + Privy + Engine
**Bounty Target:** $3,000 (Arc)
**Total Active Time:** ~18h | Buffer: ~6h
**Branch:** `feat/pietro-arc-privy-engine`

---

## Pre-Hackathon Checklist (BEFORE T+00:00)

- [ ] Install Foundry: `curl -L https://foundry.paradigm.xyz | bash && foundryup`
  - Validate: `forge --version`
- [ ] Add Arc Testnet to MetaMask
  - RPC: `https://rpc.testnet.arc.network`
  - Chain ID: `1120`
  - Symbol: `USDC`
  - Validate: MetaMask shows Arc network
- [ ] Get Arc testnet USDC from `faucet.testnet.arc.network`
  - Validate: Balance > 0
- [ ] Create Privy app at `dashboard.privy.io`, get App ID
  - Validate: App ID in `.env.local`
- [ ] Create `.env.local` with all keys (Privy App ID, Arc RPC, wallet keys)
  - Validate: File exists
- [ ] Test `forge build` with OpenZeppelin on solc 0.8.24
  - Validate: Compiles with zero errors

---

## Block 1: Privy + Arc Foundation (T+00:00 --> T+04:00)

| Time | Task | File | Validate |
|------|------|------|----------|
| T+00:00 | **CHECKPOINT 1: Interface agreement with Flavio** -- agree on `VaultAgentHooks` interface, shared types, file structure for `lib/agent/vault-agent.ts` | `lib/agent/types.ts` | Both confirm signatures |
| T+00:15 | Install + configure Privy | `app/providers.tsx`, `app/layout.tsx` | App loads, PrivyProvider wraps children |
| T+00:30 | Replace `PrivyConnectMock` with real `ConnectButton` | `components/privy-connect-wrapper.tsx`, `app/vault/create/page.tsx` | Email login --> wallet created |
| T+00:50 | Wire wallet address into vault creation | `app/vault/create/page.tsx` | Vault stores real wallet address |
| T+01:00 | Foundry init: `mkdir contracts && cd contracts && forge init --no-git`, install OZ | `contracts/`, `contracts/foundry.toml` | `forge build` succeeds |
| T+01:10 | Write `PolyAgentsMarket.sol` | `contracts/src/PolyAgentsMarket.sol` | `forge build` compiles |
| T+01:55 | Write deploy script | `contracts/script/Deploy.s.sol` | Dry-run succeeds |
| T+02:05 | Deploy to Arc Testnet | On-chain | Contract on `explorer.testnet.arc.network` |
| T+02:15 | Generate ABI + create viem market client | `lib/arc/abi.ts`, `lib/arc/market-client.ts` | Imports resolve, TypeScript compiles |
| T+02:45 | Arc API routes: markets list + create + detail + resolve | `app/api/arc/markets/route.ts`, `app/api/arc/markets/[id]/route.ts` | `curl POST` creates market on-chain |
| T+03:15 | Arc smoke test | `lib/arc/smoke-test.ts` | Market created + bet placed on explorer |
| T+03:30 | Architecture diagram (**MANDATORY for Arc bounty**) | `docs/arc-architecture.md` or in README | Shows all 3 chains |
| T+03:45 | **CHECKPOINT 2: Sync with Flavio** -- share Arc contract address + ABI | -- | Flavio has contract info |
| T+04:00 | Arc bounty checklist review | -- | All items verified |

---

## Block 2: Engine Core (T+04:00 --> T+08:00)

| Time | Task | File | Validate |
|------|------|------|----------|
| T+04:00 | Engine type definitions (states, events, domain types) | `lib/engine/types.ts` | TypeScript compiles |
| T+04:20 | State machine (IDLE-->DISCOVERING-->READY-->QUOTING-->HOLDING-->EXPIRY_GUARD-->ROLLING-->RECONCILING) | `lib/engine/state-machine.ts` | Test script cycles all states |
| T+05:00 | Risk engine (maxCapital, noNewEntriesLast, tranche limits, oversell guard) | `lib/engine/risk-engine.ts` | Asserts rejections for each rule |
| T+05:30 | Fill simulator (probability-based, supports partial fills) | `lib/engine/fill-simulator.ts` | 3 scenarios pass |
| T+06:00 | **BREAK (30min)** | -- | -- |
| T+06:30 | Agent loop orchestrator (imports Arc client + engine modules, stubs Hedera/ENS) | `lib/agent/vault-agent.ts` | 3 test cycles run with state transitions |
| T+07:15 | Engine API routes (start, stop, status, cycle) | `app/api/engine/*/route.ts` | `curl POST /api/engine/cycle` triggers cycle |
| T+07:30 | Wire `CycleButton` to real engine API | `components/cycle-button.tsx` | Click "Run Cycle" --> API call --> real state transitions |
| T+07:45 | Wire auto-mode in AgentPage to engine API | `app/vault/[id]/agent/page.tsx` | Auto cycles via API every 12s |

---

## Block 3: Integration (T+08:00 --> T+12:00)

| Time | Task | Validate |
|------|------|----------|
| T+08:00 | **MERGE 1 with Flavio** -- resolve conflicts, `npm run build` passes | Build green |
| T+08:30 | Wire Hedera into vault-agent.ts (replace stubs with Flavio's real imports) | HCS messages on Hashscan |
| T+09:00 | Wire ENS into vault-agent.ts | ENS text records update |
| T+09:30 | Wire Arc market ops into agent cycle | Markets created on Arc explorer |
| T+10:00 | Replace vault deployment stages with real chain calls | Each stage shows real tx hash |
| T+10:30 | **End-to-end smoke test:** Login --> Create --> Agent cycles --> All chains | Full flow works |
| T+11:00 | Fix integration bugs | All flows pass |
| T+12:00 | **LUNCH BREAK (60min)** | -- |

---

## Block 4: Polish + Demo (T+13:00 --> T+20:00)

| Time | Task | Validate |
|------|------|----------|
| T+13:00 | Error handling in all API routes | Failures show proper error JSON |
| T+13:30 | Wire HCS feed to real Mirror Node data | Real messages in feed |
| T+14:00 | **MERGE 2 with Flavio** | Build green |
| T+14:30 | Wire token page to real HTS data | Real balance from testnet |
| T+15:00 | Wire audit page to real HCS logs | On-chain events shown |
| T+15:30 | Wire policy page to real ENS verification | Hash match badge |
| T+16:00 | Wire markets page to real Arc markets | Real market data |
| T+16:30 | **DINNER BREAK (30min)** | -- |
| T+17:00 | Final UI consistency pass | No console errors, mobile works |
| T+17:30 | Comprehensive README (architecture diagram, setup, sponsors table) | README complete |
| T+18:00 | Create `.env.example` | All vars listed |
| T+18:30 | Record 3-min demo video | Video covers all bounties |
| T+19:00 | Fresh browser run-through | Full flow works from scratch |
| T+19:30 | Fix anything broken | Demo-ready |

---

## Block 5: Submission (T+20:00 --> T+24:00)

| Time | Task |
|------|------|
| T+20:00 | **MERGE 3 (final)** with Flavio |
| T+20:30 | Submit to Arc bounty ($3,000) |
| T+21:00 | Submit to Hedera AI Payments ($3,000) -- assist Flavio |
| T+21:30 | Submit to Hedera No Solidity ($1,000) -- assist Flavio |
| T+22:00 | Submit to ENS Most Creative ($2,500) -- assist Flavio |
| T+22:30 --> T+24:00 | Buffer for judge questions, live demos, fixes |

---

## Shared Checkpoints

| # | Time | Purpose | What Pietro Needs from Flavio | What Flavio Needs from Pietro |
|---|------|---------|-------------------------------|-------------------------------|
| 1 | T+00:00 | Interface agreement | Function signatures from `lib/hedera/*` and `lib/ens/*` | Arc contract address, ABI, API route URLs |
| 2 | T+04:00 | Module readiness sync | Working Hedera client + HCS + payment modules | Confirmation of Arc contract deployed |
| 3 | T+05:45 | Coordinate vault-agent.ts | Flavio's hook function signatures | File structure with Arc hooks in place |
| 4 | T+08:00 | **MERGE 1** | All Hedera + ENS modules stable | Arc client + engine working |
| 5 | T+14:00 | **MERGE 2** | Frontend wiring done | Frontend wiring done |
| 6 | T+20:00 | **MERGE 3 (final)** | Everything stable | Everything stable |

---

## Files Pietro Creates (22 new files)

| # | File | Scope |
|---|------|-------|
| 1 | `app/providers.tsx` | Privy |
| 2 | `components/privy-connect-wrapper.tsx` | Privy |
| 3 | `contracts/**` (entire Foundry project) | Arc |
| 4 | `lib/arc/abi.ts` | Arc |
| 5 | `lib/arc/market-client.ts` | Arc |
| 6 | `lib/arc/smoke-test.ts` | Arc |
| 7 | `app/api/arc/markets/route.ts` | Arc |
| 8 | `app/api/arc/markets/[id]/route.ts` | Arc |
| 9 | `lib/engine/types.ts` | Engine |
| 10 | `lib/engine/state-machine.ts` | Engine |
| 11 | `lib/engine/risk-engine.ts` | Engine |
| 12 | `lib/engine/fill-simulator.ts` | Engine |
| 13 | `lib/agent/vault-agent.ts` | Engine (shared with Flavio) |
| 14 | `app/api/engine/start/route.ts` | Engine |
| 15 | `app/api/engine/stop/route.ts` | Engine |
| 16 | `app/api/engine/status/route.ts` | Engine |
| 17 | `app/api/engine/cycle/route.ts` | Engine |
| 18 | `docs/arc-architecture.md` | Arc |
| 19 | `.env.example` | Shared |

---

## Shared Files Pietro Modifies

| File | Pietro's Changes |
|------|-----------------|
| `lib/agent/vault-agent.ts` | Arc hooks, engine orchestration |
| `app/vault/create/page.tsx` | Privy wiring, Arc deploy stages |
| `lib/types.ts` | Engine state fields |
| `app/layout.tsx` | PrivyProvider wrapping |
| `components/cycle-button.tsx` | Engine API call |
| `app/vault/[id]/agent/page.tsx` | Engine API wiring |
| `app/vault/[id]/markets/page.tsx` | Real Arc market data |

---

## Arc Bounty Validation Checklist

- [ ] Contract deployed on Arc Testnet with explorer link
- [ ] `createMarket` via API creates real on-chain market
- [ ] `placeBet` via API places real on-chain bet
- [ ] USDC gas token used (not ETH)
- [ ] Architecture diagram in README
- [ ] NatSpec comments on Solidity

### Merge Validation (after each merge)

- [ ] `npm run build` -- zero errors
- [ ] `npm run dev` -- starts clean
- [ ] All 10 user flows from `docs/user-flow.md` work
- [ ] No console errors in DevTools

---

## Risks (Owned by Pietro)

| Risk | Impact | Mitigation |
|------|--------|------------|
| Arc testnet RPC down | Blocked | Hardcode fallback RPC, test faucet before hackathon |
| vault-agent.ts merge conflicts | Both blocked | Agree on file structure at Checkpoint 1, use section comments |
| Flavio's modules delayed | Integration blocked | Write stubs implementing agreed interface, swap when real modules arrive |
| Privy app misconfigured | Login broken | Configure + test before hackathon |
| Engine too complex | Agent loop broken | Implement reduced state machine first (IDLE-->READY-->QUOTING-->HOLDING-->ROLLING) |
| Testnet funds depleted | Demo breaks | Fund generously (1000+ USDC, 100+ HBAR, 0.1+ ETH), monitor balances |
| Running out of time | Submissions incomplete | Prioritize bounty-critical tasks; 6h buffer available |
