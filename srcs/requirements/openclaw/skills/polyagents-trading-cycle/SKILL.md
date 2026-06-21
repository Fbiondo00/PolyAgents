---
name: polyagents-trading-cycle
description: Review a PolyAgents vault's current trading cycle — engine state, open orders, recent PnL, and the latest decision-to-outcome pairs. Use to inspect what the engine is doing right now and whether the strategy is behaving. Read-only review; the engine places all orders.
user-invocable: true
---

# PolyAgents Trading Cycle — review

This is a **read-only review** entry point. The engine owns order placement; you
do not place bets. Use this to inspect a vault's live behavior.

## Steps

1. **Status** — `engine_status(vault_id)` → is the engine running, what state
   (Idle/DiscoveringMarket/Quoting/HoldingInventory/ExpiryGuard/Reconciling)?
2. **Open orders** — `get_orders(vault_id)` → what's resting? Both sides? At
   what price? Near expiry?
3. **PnL trend** — `get_pnl(vault_id, limit=20)` → recent realized PnL snapshots.
4. **Decision→outcome pairs** — `get_recent_outcomes(vault_id, limit=10)` → the
   learning signal. For each: AI bias/confidence/reasoning, orders placed, fill
   status, winning side, realized PnL. OPEN rows are pending resolution.
5. **Recent audit** — `get_audit(vault_id, limit=20)` → cycle-start events,
   skip-low-confidence, order-failed, etc.

## Reading it

- A healthy passive-MM cycle shows both-side bids at $0.01 resting, then
  RECONCILED outcomes with both sides filled and PnL ≈ +$0.98/unit.
- Red flags: only one side ever fills; bids near $0.50; repeated
  `skip-low-confidence` (AI isn't confident); repeated `order-failed`.

## If intervention is warranted

You may adjust via `update_config` (within the SOUL.md ceilings) or
`set_active_guidance` for contextual rules. Stop the engine with `stop_engine`
if a vault is bleeding toward `max_drawdown_usdc`. Log the *why* to
`memory/YYYY-MM-DD.md`.

## Variables

- `VAULT_ID` — the vault to review. Find one with `list_vaults` or
  `active_engines`.
