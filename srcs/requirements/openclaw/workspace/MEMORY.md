# MEMORY — PolyAgents durable rules

Curated, durable lessons. Every line should change future behavior. Dreaming
promotes qualified patterns here; promote by hand only when a lesson is clearly
proven. Keep this short — it's injected into every session (budget ~20K chars).

## Strategy baseline (the thesis we're testing)

- Passive market-making: $0.01 bids on both YES and NO. Both-side fill resolves
  either way at ≈ +$0.98/unit (100×0.99 + 100×−0.01). The edge is **fill
  probability × both-side capture**, not direction.
- Failure mode to watch: one side fills, the other doesn't, market resolves
  against the filled side → −$0.01 to −$1.00/unit. Late-cycle quotes are most
  exposed (no time for the other side to fill before expiry).
- Simulated mode (`POLYMARKET_LIVE=false`) is the default. Fills are assumed to
  cross; the reconciler computes paper PnL. Don't trust "100% win rate" until
  live fills confirm it.

## Operating notes

- The engine places all orders. Influence trades only via `update_config` and
  `set_active_guidance`.
- `get_recent_outcomes` is the source of truth for what happened. PnL is lagged
  — an OPEN row has no result yet; wait for RECONCILED.
- Markets resolve every 5 min. Reflection is more signal-dense batched than
  per-cycle. Don't over-trade the heartbeat.

## Learned rules (promoted from daily notes as they prove out)

<!-- Append proven patterns here as dreaming/hand-promotion surfaces them.
     Format: one line, the rule, the evidence (date + outcome count). -->
- _(none yet — this fills in as the loop runs)_
