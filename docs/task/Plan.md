# PolyAgents -- 24h Hackathon Execution Plan

**Two developers, 24 working hours, $9,500 in bounties.**

| Developer | Scope | Bounty Target | Active Time | Buffer | Branch |
|-----------|-------|---------------|-------------|--------|--------|
| **Pietro** | Arc + Privy + Engine | $3,000 (Arc) | ~18h | ~6h | `feat/pietro-arc-privy-engine` |
| **Flavio** | Hedera + ENS | $3,000 (AI Payments) + $1,000 (No Solidity) + $2,500 (ENS) = $6,500 | ~13h | ~11h | `feat/flavio-hedera-ens` |

**Architecture:** All backend logic as TypeScript modules in `lib/` with Next.js API Route Handlers in `app/api/`. No separate Express server.

---

## Pre-Hackathon Checklist (BEFORE T+00:00)

### Pietro

- [ ] Install Foundry: `curl -L https://foundry.paradigm.xyz | bash && foundryup` -- validate: `forge --version`
- [ ] Add Arc Testnet to MetaMask (RPC: `https://rpc.testnet.arc.network`, Chain ID: 1120, Symbol: USDC)
- [ ] Get Arc testnet USDC from `faucet.testnet.arc.network` -- validate: Balance > 0
- [ ] Create Privy app at `dashboard.privy.io`, get App ID -- validate: in `.env.local`
- [ ] Create `.env.local` with all keys
- [ ] Test `forge build` with OpenZeppelin on solc 0.8.24 -- validate: compiles

### Flavio

- [ ] Register Hedera testnet account at `portal.hedera.com` -- validate: Operator ID + Key received
- [ ] Fund Hedera account via faucet (>=100 HBAR) -- validate: Balance query returns hbars
- [ ] Register `polyagents.eth` on ENS (or confirm Sepolia ENS) -- validate: Name resolves
- [ ] Fund Sepolia wallet with >=0.1 ETH for ENS writes -- validate: Balance > 0
- [ ] Verify `@hashgraph/sdk` works in isolated script -- validate: Prints balance
- [ ] Verify viem can read ENS text record on Sepolia -- validate: `getText()` returns value
- [ ] Create `.env.local` with all keys (share template with Pietro)
- [ ] Test Hedera key format -- confirm `fromStringEd25519()` works
- [ ] Verify ENS Sepolia resolver address is current

---

## Parallel Timeline

### T+00:00 -- CHECKPOINT 1: Interface Agreement

**Both devs meet for 15 minutes.**

| Item | Pietro Provides | Flavio Provides |
|------|----------------|-----------------|
| Shared types | Arc contract address, ABI, API route URLs | Function signatures from `lib/hedera/*` and `lib/ens/*` |
| File structure | `lib/agent/vault-agent.ts` structure with Arc hooks | Hook function signatures |
| Output | `lib/agent/types.ts` agreed | `lib/agent/types.ts` agreed |

After checkpoint, both devs split to their branches.

---

### T+00:15 -> T+02:30 -- Parallel Work

| Time | Pietro (Arc + Privy) | Flavio (Hedera) |
|------|---------------------|-----------------|
| T+00:15 | Install + configure Privy | Install `@hashgraph/sdk`, `dotenv` |
| T+00:20 | -- | Hedera client wrapper |
| T+00:30 | Replace `PrivyConnectMock` with real `ConnectButton` | HTS vault token (create + mint, custom HBAR fee) |
| T+00:45 | -- | HCS audit topic + logging |
| T+00:50 | Wire wallet address into vault creation | -- |
| T+01:00 | Foundry init + install OpenZeppelin | Agent micropayment (0.001 HBAR per LLM call) |
| T+01:10 | Write `PolyAgentsMarket.sol` | -- |
| T+01:15 | -- | HCS-14 agent identity registration |
| T+01:35 | -- | Scheduled transaction |
| T+01:55 | Write deploy script | -- |
| T+01:50 | -- | Mirror Node REST API client |
| T+02:05 | Deploy to Arc Testnet | Hedera vault orchestrator |
| T+02:15 | Generate ABI + create viem market client | -- |
| T+02:20 | -- | **Validate Phase 1** -- run `initHederaVault()` standalone |

**Flavio Phase 1 deliverable:** 4 Hashscan URLs verified (token, topic, agent ID, schedule)

---

### T+02:30 -> T+04:00 -- Pietro continues Arc / Flavio starts ENS

| Time | Pietro (Arc) | Flavio (ENS) |
|------|-------------|-------------|
| T+02:30 | -- | ENS client (Sepolia public + wallet clients) |
| T+02:40 | -- | Policy hash commitment (keccak256 + setText) |
| T+02:45 | Arc API routes: markets CRUD | -- |
| T+03:00 | -- | Agent stats text records (5 keys per vault) |
| T+03:15 | Arc smoke test | Subname creation |
| T+03:25 | -- | ENS vault orchestrator |
| T+03:30 | Architecture diagram (**MANDATORY for Arc bounty**) | -- |
| T+03:40 | -- | **Validate Phase 2** -- run `initVaultENS()` standalone |

**Flavio Phase 2 deliverable:** 6 ENS text records verified

---

### T+04:00 -- CHECKPOINT 2: Module Readiness Sync

| Pietro Shares | Flavio Shares |
|--------------|---------------|
| Arc contract deployed + explorer link | Working Hedera client + HCS + payment modules |
| ABI + API route URLs | ENS client + policy hash + subname working |
| Arc bounty checklist status | Hedera + ENS bounty checklist status |

---

### T+04:00 -> T+05:15 -- Pietro: Engine / Flavio: API Routes

| Time | Pietro (Engine) | Flavio (API Routes) |
|------|----------------|---------------------|
| T+04:00 | Engine type definitions | -- |
| T+04:15 | -- | Hedera vault init API |
| T+04:20 | State machine (IDLE->...->RECONCILING) | -- |
| T+04:25 | -- | Audit logs API |
| T+04:35 | -- | Payment history API |
| T+04:45 | -- | Token info API |
| T+04:55 | -- | Schedule status API |
| T+05:00 | Risk engine | -- |
| T+05:05 | -- | ENS init API |
| T+05:10 | -- | ENS verify API |
| T+05:30 | Fill simulator | -- |

---

### T+05:15 -> T+05:45 -- BREAK (30 min)

---

### T+05:45 -- CHECKPOINT 3: Coordinate vault-agent.ts

**Both devs agree on file structure and section ownership of `lib/agent/vault-agent.ts`.**

---

### T+05:45 -> T+07:15 -- Agent Loop Hooks

| Time | Pietro (Engine) | Flavio (Agent Hooks) |
|------|----------------|----------------------|
| T+05:55 | -- | Add Hedera `onVaultCreated` hook |
| T+06:00 | **BREAK (30min)** | -- |
| T+06:10 | -- | Add Hedera `onBeforeLLMCall` hook |
| T+06:20 | -- | Add Hedera `onTradeDecision` hook |
| T+06:30 | Agent loop orchestrator (Arc + engine, stubs Hedera/ENS) | Add ENS `onVaultCreated` hook |
| T+06:40 | -- | Add ENS `onCycleComplete` hook |
| T+06:50 | -- | Add ENS `onPolicySave` hook |
| T+07:00 | -- | **Merge test with Pietro** -- full agent cycle |
| T+07:15 | Engine API routes (start, stop, status, cycle) | -- |
| T+07:30 | Wire `CycleButton` to real engine API | -- |
| T+07:45 | Wire auto-mode in AgentPage to engine API | -- |

**Merge test gate:** Arc tx + Hedera payment + HCS log + ENS stats all appear on-chain.

---

### T+07:15 -> T+08:00 -- Flavio: Frontend Wiring

| Time | Flavio |
|------|--------|
| T+07:15 | Replace mock `deploy()` with real API calls |
| T+07:40 | Wire HCS feed to real Mirror Node data |

---

### T+08:00 -- MERGE 1

**Both branches merge into `main`.**

Merge validation:
- [ ] `npm run build` -- zero errors
- [ ] `npm run dev` -- starts clean
- [ ] All 10 user flows work
- [ ] No console errors in DevTools

---

### T+08:00 -> T+09:15 -- Integration (Pietro) + Frontend Wiring (Flavio)

| Time | Pietro (Integration) | Flavio (Frontend) |
|------|---------------------|-------------------|
| T+08:00 | Wire Hedera into vault-agent.ts | -- |
| T+08:20 | -- | Wire policy page to real keccak256 + ENS verification |
| T+08:30 | -- | -- |
| T+08:45 | -- | Create ENS verification component |
| T+09:00 | Wire ENS into vault-agent.ts | Wire audit page to real HCS logs |
| T+09:30 | Wire Arc market ops into agent cycle | -- |

---

### T+09:15 -> T+11:15 -- Integration Testing (Flavio) + E2E (Pietro)

| Time | Pietro | Flavio (Integration Testing) |
|------|--------|------------------------------|
| T+09:15 | -- | E2E test #1: Create vault -> verify all 7 artifacts |
| T+09:45 | -- | E2E test #2: Run 3 agent cycles -> verify payments, HCS, ENS updates |
| T+10:00 | Replace vault deployment stages with real chain calls | -- |
| T+10:15 | -- | Fix bugs (Mirror Node delay, SDK serialization, nonce conflicts) |
| T+10:30 | **End-to-end smoke test:** Login -> Create -> Agent cycles -> All chains | -- |
| T+11:00 | Fix integration bugs | Error state testing (failed tx, slow Mirror Node, no funds) |

---

### T+11:15 -> T+12:00 -- Polish (Flavio) + Bug Fixes (Pietro)

| Time | Pietro | Flavio (Polish) |
|------|--------|-----------------|
| T+11:15 | Continue fixing integration bugs | Add Hashscan links to HCS feed items |
| T+11:25 | -- | Add Hedera network status to agent page |
| T+11:40 | -- | Add ENS dashboard section to vault overview |
| T+12:00 | -- | Remove all mock data references -- `npm run build` passes |

---

### T+12:00 -- LUNCH BREAK (60 min)

---

### T+12:20 -> T+13:15 -- Polish continues (Flavio) + Error handling (Pietro)

| Time | Pietro | Flavio |
|------|--------|--------|
| T+12:20 | -- | Write Hedera section of README |
| T+12:40 | -- | Write ENS section of README |
| T+12:55 | -- | Prepare live demo script |
| T+13:00 | Error handling in all API routes | -- |
| T+13:30 | Wire HCS feed to real Mirror Node data | -- |

---

### T+13:15 -- Flavio Submission Phase

| Time | Flavio |
|------|--------|
| T+13:15 | **CHECKPOINT 4: Final sync** |
| T+13:30 | Production build test |
| T+13:40 | Record demo video segment (Hedera + ENS) |
| T+13:55 | Submit: Hedera AI Payments + No Solidity + ENS |

---

### T+14:00 -- MERGE 2

**Both branches merge into `main`.**

Merge validation:
- [ ] `npm run build` -- zero errors
- [ ] `npm run dev` -- starts clean
- [ ] All user flows work
- [ ] No console errors in DevTools

---

### T+14:00 -> T+16:30 -- Polish + Frontend Wiring (Pietro)

| Time | Pietro |
|------|--------|
| T+14:30 | Wire token page to real HTS data |
| T+15:00 | Wire audit page to real HCS logs |
| T+15:30 | Wire policy page to real ENS verification |
| T+16:00 | Wire markets page to real Arc markets |

---

### T+16:30 -- DINNER BREAK (30 min)

---

### T+17:00 -> T+20:00 -- Final Polish + Demo Prep (Pietro)

| Time | Pietro |
|------|--------|
| T+17:00 | Final UI consistency pass |
| T+17:30 | Comprehensive README (architecture diagram, setup, sponsors table) |
| T+18:00 | Create `.env.example` |
| T+18:30 | Record 3-min demo video |
| T+19:00 | Fresh browser run-through |
| T+19:30 | Fix anything broken |

---

### T+20:00 -- MERGE 3 (Final)

**Final merge into `main`.**

Merge validation:
- [ ] `npm run build` -- zero errors
- [ ] `npm run dev` -- starts clean
- [ ] All user flows work
- [ ] No console errors in DevTools

---

### T+20:00 -> T+22:30 -- Submissions

| Time | Task | Bounty |
|------|------|--------|
| T+20:30 | Submit to Arc bounty | $3,000 |
| T+21:00 | Submit to Hedera AI & Agentic Payments | $3,000 |
| T+21:30 | Submit to Hedera No Solidity | $1,000 |
| T+22:00 | Submit to ENS Most Creative | $2,500 |

### T+22:30 -> T+24:00 -- Buffer

Reserved for: judge questions, live demos, emergency fixes, rest.

---

## Shared File Ownership

Files where both devs make changes -- coordinate at checkpoints:

| File | Pietro Changes | Flavio Changes |
|------|---------------|----------------|
| `lib/agent/vault-agent.ts` | Arc hooks, engine orchestration | Hedera + ENS hooks |
| `app/vault/create/page.tsx` | Privy wiring, Arc deploy stages | Hedera + ENS deploy stages |
| `lib/types.ts` | Engine state fields | Hedera/ENS context fields |
| `app/layout.tsx` | PrivyProvider wrapping | -- |
| `components/cycle-button.tsx` | Engine API call | -- |
| `app/vault/[id]/agent/page.tsx` | Engine API wiring | Hedera status indicator |
| `components/hcs-feed.tsx` | -- | Real Mirror Node data |
| `app/vault/[id]/token/page.tsx` | -- | Real HTS data |
| `app/vault/[id]/policy/page.tsx` | -- | Real keccak256 + ENS verify |
| `components/policy-hash-card.tsx` | -- | ENS on-chain badge |
| `app/vault/[id]/audit/page.tsx` | -- | Real HCS events |
| `app/vault/[id]/markets/page.tsx` | Real Arc market data | -- |
| `app/vault/[id]/page.tsx` | -- | ENS dashboard section |

---

## Validation Checklist

### Arc ($3,000)

- [ ] Contract deployed on Arc Testnet with explorer link
- [ ] `createMarket` via API creates real on-chain market
- [ ] `placeBet` via API places real on-chain bet
- [ ] USDC gas token used (not ETH)
- [ ] Architecture diagram in README
- [ ] NatSpec comments on Solidity

### Hedera -- AI & Agentic Payments ($3,000)

- [ ] Agent makes HBAR payment before each LLM call
- [ ] Payment visible on Hashscan
- [ ] HCS audit log after each decision
- [ ] HCS-14 agent identity registered with UAID
- [ ] Scheduled transaction created
- [ ] README with payment flow

### Hedera -- No Solidity ($1,000)

- [ ] HTS token created (zero Solidity)
- [ ] HCS topic created (zero Solidity)
- [ ] Mirror Node queries work
- [ ] Creative data integrity use of HCS

### ENS -- Most Creative ($2,500)

- [ ] Vault subname created (`{vaultId}.polyagents.eth`)
- [ ] Policy hash committed as `policy.commitment` text record
- [ ] Agent stats updatable as text records (5 keys)
- [ ] Verification UI shows on-chain vs local hash match
- [ ] Creative concept explained in README

---

## Risks

| Risk | Impact | Owner | Mitigation |
|------|--------|-------|------------|
| Arc testnet RPC down | Pietro blocked | Pietro | Hardcode fallback RPC, test faucet before hackathon |
| Hedera SDK key format mismatch | Flavio blocked | Flavio | Test connection pre-hackathon, `fromStringEd25519()` fallback |
| ENS Sepolia resolver address outdated | Flavio blocked | Flavio | Verify pre-hackathon, query registry for current resolver |
| vault-agent.ts merge conflicts | Both blocked | Both | Agree on file structure at Checkpoint 1, use section comments |
| Flavio's modules delayed | Pietro integration blocked | Pietro | Write stubs implementing agreed interface, swap when real modules arrive |
| Mirror Node propagation delay | HCS feed empty | Flavio | Add 3s retry polling, cache in localStorage |
| Privy app misconfigured | Login broken | Pietro | Configure + test before hackathon |
| Engine too complex | Agent loop broken | Pietro | Implement reduced state machine first (IDLE->READY->QUOTING->HOLDING->ROLLING) |
| Testnet funds depleted | Demo breaks | Both | Fund generously (1000+ USDC, 100+ HBAR, 0.1+ ETH) |
| Running out of time | Submissions incomplete | Both | Flavio has 10h buffer, Pietro has 6h -- prioritize bounty-critical tasks |
