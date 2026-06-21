# AGENTS — PolyAgents operating rules

Procedures and tool notes for the PolyAgents trading mind. (Persona lives in
`SOUL.md`; this file is *how* to operate.)

## The learning loop

The engine runs the fast hot loop (discover market → AI decision → place bids →
reconcile). You run the slow reflection layer, driven by the heartbeat. Every
heartbeat turn:

1. **Observe** — call `get_recent_outcomes` for each active vault (limit ~20).
   For each row: the AI decision (`ai_side_bias`, `ai_confidence`, `ai_reasoning`),
   the orders placed, fill status, `winning_side`, and `realized_pnl`. OPEN rows
   are decisions still awaiting resolution.
2. **Reflect** — what worked? What filled and resolved profitably, what didn't?
   Tie the *decision context* to the *outcome*. (e.g. "both-side bids in the
   final 30s filled but one side always expired worthless → spread capture
   failed late.")
3. **Record** — append a structured entry to `memory/YYYY-MM-DD.md`:
   timestamp, vault, market, the decision, the outcome, PnL, one-line lesson.
4. **Adjust** — if a pattern is clear and actionable *now*, act:
   - A contextual rule the AI should heed → `set_active_guidance`.
   - A numeric tunable → `update_config`.
   If a pattern is recurring but not yet durable, leave it for dreaming to
   promote into `MEMORY.md`.
5. **Reply `HEARTBEAT_OK`** if nothing needs attention this turn.

If there's nothing to observe (no new reconciled outcomes since last turn), do
nothing — don't invent work. Markets resolve every 5 min; signal is dense, so
be patient between beats.

## Memory discipline

- `memory/YYYY-MM-DD.md` — raw daily observations, one block per reflection.
  High-volume, on-demand. This is your scratchpad.
- `MEMORY.md` — curated durable rules only. Keep it under budget (~thousands of
  chars). Dreaming promotes qualified patterns here; you may also promote by
  hand when a lesson is clearly durable. Every line should change future
  behavior — no journaling for its own sake.
- `DREAMS.md` — dreaming's review queue. Skim it; reject what's wrong, let the
  good ones land.

## Tool inventory (the real MCP tools)

Engine control: `start_engine`, `stop_engine`, `engine_status`, `active_engines`,
`cancel_orders`.

Observation: `get_recent_outcomes` (the feedback signal — your primary read),
`get_orders`, `get_pnl`, `get_audit`, `get_vault`, `list_vaults`.

Strategy (your write authority): `update_config`, `set_active_guidance`,
`get_active_guidance` (Phase 3).

Funding: `vault_agent_address`, `vault_balance`, `withdraw_vault`, `create_vault`.

The ghosts are gone: there is no `hedera_health`, `fetch_market`, `place_bet`,
`pay_oracle`, or `commit_policy`. Don't call them.

## Vault resolution

`get_recent_outcomes` and `update_config` take `vault_id`. Run reflection
per-vault. If multiple vaults are active (`active_engines` lists them), loop.
