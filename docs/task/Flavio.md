# Flavio -- Hackathon Task List

**Scope:** Hedera + ENS
**Bounty targets:** $3,000 AI Payments + $1,000 No Solidity + $2,500 ENS = **$6,500**
**Total active time:** ~13h | Buffer: ~11h
**Branch:** `feat/flavio-hedera-ens`

---

## Pre-Hackathon Checklist (BEFORE T+00:00)

- [ ] Register Hedera testnet account at `portal.hedera.com`
- [ ] Fund Hedera account via faucet (>=100 HBAR)
- [ ] Register `vaultpilot.eth` on ENS (or confirm Sepolia ENS)
- [ ] Fund Sepolia wallet with >=0.1 ETH for ENS writes
- [ ] Verify `@hashgraph/sdk` works in isolated script (prints balance)
- [ ] Verify viem can read ENS text record on Sepolia (`getText()` returns value)
- [ ] Create `.env.local` with all keys (share template with Pietro)
- [ ] Test Hedera key format -- confirm `fromStringEd25519()` works with your key
- [ ] Verify ENS Sepolia resolver address is current (query registry)

---

## Block 1: Hedera Foundation (T+00:00 -> T+02:30)

| Time | Task | File | Bounty | Validate |
|------|------|------|--------|----------|
| T+00:00 | **CHECKPOINT 1: Interface agreement with Pietro** | `lib/agent/types.ts` | All | Both confirm signatures |
| T+00:15 | Install `@hashgraph/sdk`, `dotenv` | `package.json` | Hedera | `npm ls @hashgraph/sdk` passes |
| T+00:20 | Hedera client wrapper | `lib/hedera/client.ts` | Base | Balance query returns hbars |
| T+00:30 | HTS vault token (create + mint, custom HBAR fee) | `lib/hedera/hts-vault.ts` | No Solidity #1 | Token on Hashscan |
| T+00:45 | HCS audit topic + logging | `lib/hedera/hcs-logger.ts` | No Solidity #2 + AI | Topic + message on Hashscan |
| T+01:00 | Agent micropayment (0.001 HBAR per LLM call) | `lib/hedera/agent-payment.ts` | **AI $3K core** | Payment tx on Hashscan |
| T+01:15 | HCS-14 agent identity registration | `lib/hedera/agent-identity.ts` | AI Bonus #2 | UAID topic on Hashscan |
| T+01:35 | Scheduled transaction | `lib/hedera/scheduler.ts` | AI Bonus #3 | Schedule on Hashscan |
| T+01:50 | Mirror Node REST API client | `lib/hedera/mirror-node.ts` | No Solidity + AI | Returns real audit logs |
| T+02:05 | Hedera vault orchestrator (chains all modules) | `lib/hedera/vault-init.ts` | All Hedera | Full init: 4 artifacts on Hashscan |
| T+02:20 | **Validate Phase 1 end-to-end** -- run `initHederaVault()` standalone | -- | All | 4 Hashscan URLs verified |

---

## Block 2: ENS Foundation (T+02:30 -> T+04:15)

| Time | Task | File | Bounty | Validate |
|------|------|------|--------|----------|
| T+02:30 | ENS client (Sepolia public + wallet clients) | `lib/ens/client.ts` | ENS | `getChainId()` returns 11155111 |
| T+02:40 | Policy hash commitment (keccak256 + setText) | `lib/ens/policy-commitment.ts` | **ENS $2.5K core** | Read back matches computed hash |
| T+03:00 | Agent stats text records (5 keys per vault) | `lib/ens/agent-stats.ts` | ENS | Read back shows updated values |
| T+03:15 | Subname creation | `lib/ens/subname.ts` | ENS | `vault-test.vaultpilot.eth` resolves |
| T+03:25 | ENS vault orchestrator | `lib/ens/vault-ens-init.ts` | ENS | Full setup: subname + hash + stats |
| T+03:40 | **Validate Phase 2 end-to-end** -- run `initVaultENS()` standalone | -- | ENS | 6 text records verified |
| T+04:00 | **CHECKPOINT 2: Sync with Pietro** -- share Hedera/ENS types | -- | Cross-cutting | Pietro confirms interface |

---

## Block 3: API Routes (T+04:15 -> T+05:15)

| Time | Task | File | Validate |
|------|------|------|----------|
| T+04:15 | Hedera vault init API | `app/api/hedera/vault/route.ts` | POST returns `HederaVaultContext` |
| T+04:25 | Audit logs API | `app/api/hedera/vault/[vaultId]/audit/route.ts` | GET returns HCS messages |
| T+04:35 | Payment history API | `app/api/hedera/agent/payments/route.ts` | GET returns payment array |
| T+04:45 | Token info API | `app/api/hedera/vault/[vaultId]/token/route.ts` | GET returns token data |
| T+04:55 | Schedule status API | `app/api/hedera/schedule/[scheduleId]/route.ts` | GET returns schedule status |
| T+05:05 | ENS init API | `app/api/ens/vault/route.ts` | POST returns ENS context |
| T+05:10 | ENS verify API | `app/api/ens/vault/[vaultId]/verify/route.ts` | GET returns all text records |

---

## BREAK (T+05:15 -> T+05:45)

- [ ] Take a 30-minute break
- [ ] Stretch, hydrate, review Block 1-3 progress

---

## Block 4: Agent Loop Hooks (T+05:45 -> T+07:15)

| Time | Task | File | Validate |
|------|------|------|----------|
| T+05:45 | **CHECKPOINT 3: Coordinate vault-agent.ts writes** with Pietro | -- | File structure agreed |
| T+05:55 | Add Hedera `onVaultCreated` hook | `lib/agent/vault-agent.ts` | HederaVaultContext logged |
| T+06:10 | Add Hedera `onBeforeLLMCall` hook | `lib/agent/vault-agent.ts` | Payment receipt logged |
| T+06:20 | Add Hedera `onTradeDecision` hook | `lib/agent/vault-agent.ts` | Trade events in HCS topic |
| T+06:30 | Add ENS `onVaultCreated` hook | `lib/agent/vault-agent.ts` | ENS subname created |
| T+06:40 | Add ENS `onCycleComplete` hook | `lib/agent/vault-agent.ts` | ENS text records update |
| T+06:50 | Add ENS `onPolicySave` hook | `lib/agent/vault-agent.ts` | Hash updates on ENS |
| T+07:00 | **Merge test with Pietro** -- full agent cycle | -- | Arc tx + Hedera payment + HCS log + ENS stats |

---

## Block 5: Frontend Wiring (T+07:15 -> T+09:15)

| Time | Task | File | Validate |
|------|------|------|----------|
| T+07:15 | Replace mock `deploy()` with real API calls | `app/vault/create/page.tsx` | Deploy creates real chain artifacts |
| T+07:40 | Wire HCS feed to real Mirror Node data | `components/hcs-feed.tsx` | Real messages in feed |
| T+08:00 | Wire token page to real HTS data | `app/vault/[id]/token/page.tsx` | Real balance from testnet |
| T+08:20 | Wire policy page to real keccak256 + ENS verification | `app/vault/[id]/policy/page.tsx` | VERIFIED badge shown |
| T+08:45 | Create ENS verification component | `components/ens-verification.tsx` | Renders with real ENS data |
| T+09:00 | Wire audit page to real HCS logs | `app/vault/[id]/audit/page.tsx` | On-chain events shown |

---

## Block 6: Integration Testing (T+09:15 -> T+11:15)

| Time | Task | Validate |
|------|------|----------|
| T+09:15 | **E2E test #1:** Create vault -> verify all 7 artifacts (HTS, HCS topic, HCS-14, Schedule, ENS subname, policy hash, agent stats) | 7 checkpoints pass |
| T+09:45 | **E2E test #2:** Run 3 agent cycles -> verify micropayments, HCS messages, ENS stats updates | 5 checkpoints pass |
| T+10:15 | Fix bugs (Mirror Node delay, SDK serialization, nonce conflicts) | All validations still pass |
| T+11:00 | Error state testing (failed tx, slow Mirror Node, no funds) | No crashes |

---

## Block 7: Polish (T+11:15 -> T+13:15)

| Time | Task | Validate |
|------|------|----------|
| T+11:15 | Add Hashscan links to HCS feed items | Clickable links |
| T+11:25 | Add Hedera network status to agent page | Shows "HCS: Connected" |
| T+11:40 | Add ENS dashboard section to vault overview | ENS identity card shown |
| T+12:00 | Remove all mock data references | `npm run build` passes, zero mocks |
| T+12:20 | Write Hedera section of README | All services listed |
| T+12:40 | Write ENS section of README | Creative use explained |
| T+12:55 | Prepare live demo script | Walkthrough < 3 minutes |

---

## Block 8: Submission (T+13:15 -> T+14:00)

| Time | Task | Validate |
|------|------|----------|
| T+13:15 | **CHECKPOINT 4: Final merge with Pietro** | `npm run build` passes |
| T+13:30 | Production build test | All pages load |
| T+13:40 | Record demo video segment (Hedera + ENS) | Video covers both bounties |
| T+13:55 | Submit: Hedera AI Payments + No Solidity + ENS | 3 submissions confirmed |

---

## Buffer (T+14:00 -> T+24:00): 10 hours

Reserved for: Hedera SDK issues, ENS Sepolia problems, merge conflicts, demo failures, judge questions, rest.

---

## Shared Checkpoints

| # | Time | What You Need from Pietro | What Pietro Needs from You |
|---|------|--------------------------|---------------------------|
| 1 | T+00:00 | Arc contract address, ABI, API route URLs | Function signatures from `lib/hedera/*` and `lib/ens/*` |
| 2 | T+04:00 | Confirmation of Arc contract deployed | Working Hedera client + HCS + payment modules |
| 3 | T+05:45 | File structure with Arc hooks in place | Your hook function signatures for vault-agent.ts |
| 4 | T+08:00 | Arc client + engine working | All Hedera + ENS modules stable (**MERGE 1**) |
| 5 | T+14:00 | Frontend wiring done | Frontend wiring done (**MERGE 2**) |
| 6 | T+20:00 | Everything stable | Everything stable (**MERGE 3 -- final**) |

---

## Files You Create (21 files)

| # | File | Scope |
|---|------|-------|
| 1 | `lib/agent/types.ts` | Shared |
| 2 | `lib/hedera/client.ts` | Hedera |
| 3 | `lib/hedera/hts-vault.ts` | Hedera |
| 4 | `lib/hedera/hcs-logger.ts` | Hedera |
| 5 | `lib/hedera/agent-payment.ts` | Hedera |
| 6 | `lib/hedera/agent-identity.ts` | Hedera |
| 7 | `lib/hedera/scheduler.ts` | Hedera |
| 8 | `lib/hedera/mirror-node.ts` | Hedera |
| 9 | `lib/hedera/vault-init.ts` | Hedera |
| 10 | `lib/ens/client.ts` | ENS |
| 11 | `lib/ens/policy-commitment.ts` | ENS |
| 12 | `lib/ens/agent-stats.ts` | ENS |
| 13 | `lib/ens/subname.ts` | ENS |
| 14 | `lib/ens/vault-ens-init.ts` | ENS |
| 15 | `app/api/hedera/vault/route.ts` | Hedera |
| 16 | `app/api/hedera/vault/[vaultId]/audit/route.ts` | Hedera |
| 17 | `app/api/hedera/agent/payments/route.ts` | Hedera |
| 18 | `app/api/hedera/vault/[vaultId]/token/route.ts` | Hedera |
| 19 | `app/api/hedera/schedule/[scheduleId]/route.ts` | Hedera |
| 20 | `app/api/ens/vault/route.ts` | ENS |
| 21 | `app/api/ens/vault/[vaultId]/verify/route.ts` | ENS |
| 22 | `components/ens-verification.tsx` | ENS |

---

## Shared Files You Modify

| File | Your Changes |
|------|-------------|
| `lib/agent/vault-agent.ts` | Hedera + ENS hooks |
| `app/vault/create/page.tsx` | Hedera + ENS deploy stages |
| `lib/types.ts` | Hedera/ENS context fields |
| `app/vault/[id]/agent/page.tsx` | Hedera status indicator |
| `components/hcs-feed.tsx` | Real Mirror Node data |
| `app/vault/[id]/token/page.tsx` | Real HTS data |
| `app/vault/[id]/policy/page.tsx` | Real keccak256 + ENS verify |
| `components/policy-hash-card.tsx` | ENS on-chain badge |
| `app/vault/[id]/audit/page.tsx` | Real HCS events |
| `app/vault/[id]/page.tsx` | ENS dashboard section |

---

## Validation Checklist

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

- [ ] Vault subname created (`{vaultId}.vaultpilot.eth`)
- [ ] Policy hash committed as `policy.commitment` text record
- [ ] Agent stats updatable as text records (5 keys)
- [ ] Verification UI shows on-chain vs local hash match
- [ ] Creative concept explained in README

### Merge Validation (after each merge)

- [ ] `npm run build` -- zero errors
- [ ] `npm run dev` -- starts clean
- [ ] All user flows work
- [ ] No console errors in DevTools

---

## Risks You Own

| Risk | Impact | Mitigation |
|------|--------|------------|
| Hedera SDK key format mismatch | Blocked | Test connection at pre-hackathon, have `fromStringEd25519()` fallback |
| ENS Sepolia resolver address outdated | Blocked | Verify at pre-hackathon, query registry for current resolver |
| Mirror Node propagation delay | HCS feed empty | Add 3s retry polling, cache in localStorage |
| Testnet funds depleted | Demo breaks | Fund generously (100+ HBAR, 0.1+ ETH), monitor balances |
| Running out of time | Submissions incomplete | You have 10h buffer -- prioritize bounty-critical tasks |

### Shared Risk (coordinate with Pietro)

| Risk | Impact | Mitigation |
|------|--------|------------|
| `vault-agent.ts` merge conflicts | Both blocked | Agree on file structure at Checkpoint 1, use section comments |
