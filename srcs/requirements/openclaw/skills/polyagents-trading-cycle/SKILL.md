---
name: polyagents-trading-cycle
description: Autonomous trading cycle for PolyAgents vault — discover market, analyze, place bids, monitor fills, sell, reconcile
triggers:
  - "run trading cycle"
  - "execute cycle"
  - "start trading"
---

# PolyAgents Trading Cycle

Execute a full autonomous trading cycle for a PolyAgents vault:

1. Check engine health via `hedera_health`
2. Discover active market via `fetch_market`
3. Analyze market conditions (AI reasoning)
4. Place bids on both sides via `place_bet`
5. Monitor fills and sell coverage
6. Log cycle to Hedera via `pay_oracle`
7. Update agent stats via `commit_policy`
8. Reconcile PnL via `engine_status`

## Variables

- `VAULT_ID` — Target vault ID
- `RUN_ID` — Active engine run ID

## Script

```bash
npx tsx skills/polyagents-trading-cycle/scripts/run-cycle.ts
```
