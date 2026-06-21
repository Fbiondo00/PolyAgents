---
name: polyagents-reflect
description: The PolyAgents learning turn. Pull recent decision-to-outcome pairs, reflect on what made or lost money, record the observation, and make at most one bounded adjustment (guidance or config). Triggered by the heartbeat; also callable directly. This is how the agent learns from feedback.
user-invocable: true
---

# PolyAgents Reflect — learn from the feedback signal

This is the core of the self-learning loop. Run it on each heartbeat (or on
demand). One turn = observe → reflect → record → (maybe) one adjustment.

## 1. Observe

Call `active_engines`. For each active vault, call
`get_recent_outcomes(vault_id, limit=20)`.

Separate the rows:
- **RECONCILED** (new since last beat) — these carry `winning_side` +
  `realized_pnl`. This is the signal.
- **OPEN** — decisions awaiting market resolution. Mostly ignore, unless one is
  very old (stuck reconciliation → flag it).

If there are **no new RECONCILED outcomes** since the last reflection, reply
`HEARTBEAT_OK` and stop — nothing to learn this beat.

## 2. Reflect

For each new RECONCILED outcome, connect the **decision** to the **result**:
- Did `ai_side_bias` + `ai_confidence` predict `winning_side`?
- Did both sides fill (`yes_filled_qty`, `no_filled_qty`), or only one?
  Both-side fill is the spread-capture thesis working.
- What was `realized_pnl` per unit, and why? (both fill ≈ +0.98; one-side
  loss ≈ −0.01 to −1.00; no fill = 0)
- Look at `decision_inputs` (book top, prices, simulated flag) for context.

Look for a pattern **across ≥2 outcomes** before acting on it. One data point
is noise.

## 3. Record

Append to `memory/YYYY-MM-DD.md` (today's date) one block per meaningful
reflection:

```
## HH:MM UTC — <one-line theme>
- vault <id>, market <id>: bias=<>, conf=<>, result=<winning_side>, pnl=<>
- both-side filled: yes/no ; seconds_to_expiry at decision: <>
- lesson: <one concrete sentence>
```

## 4. Adjust (at most one per beat, only with ≥2-outcome evidence)

Pick the single highest-leverage change:

- **Contextual rule** the engine AI should heed (knobs can't express it) →
  `set_active_guidance(vault_id, "<rule>")`. Examples: "Skip both-side quotes
  when seconds_to_expiry < 60 and spread > 2¢"; "Discount confidence ~30% in
  the final 30s."
- **Numeric tunable** → `update_config(vault_id, ...)`. Stay inside SOUL.md
  ceilings (bid ≤ $0.05 working range; never touch `max_drawdown_usdc` down;
  never enable live mode).

If the evidence is real but not yet durable, **don't act** — leave it in the
daily note for dreaming to consolidate into `MEMORY.md` later.

## 5. Close

Reply `HEARTBEAT_OK` if you only recorded, or a one-line summary of the
adjustment you made. Never stack multiple config changes on thin evidence.

## Discipline

- The engine places all orders. You never call a "place order" tool — there
  isn't one.
- Simulated PnL (decision_inputs.simulated=true) is a hypothesis, not a result.
  Don't promote "100% win rate" from sim to MEMORY.md until live fills confirm.
- `max_drawdown_usdc` breach → `stop_engine` + surface, don't quietly tighten.
