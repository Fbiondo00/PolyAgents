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

### `polyagents` — engine control + learning loop

Engine control: `start_engine`, `stop_engine`, `engine_status`, `active_engines`,
`cancel_orders`.

Observation: `get_recent_outcomes` (the feedback signal — your primary read),
`get_orders`, `get_pnl`, `get_audit`, `get_vault`, `list_vaults`.

Strategy (your write authority): `update_config`, `set_active_guidance`,
`get_active_guidance` (Phase 3).

Funding: `vault_agent_address`, `vault_balance`, `withdraw_vault`, `create_vault`.

The ghosts are gone: there is no `hedera_health`, `fetch_market`, `place_bet`,
`pay_oracle`, or `commit_policy`. Don't call them.

### `postgres-supabase` — read-only SQL against the engine's database

`@modelcontextprotocol/server-postgres`, **read-only**. Use it to inspect raw
state behind the engine tools — the same tables `get_recent_outcomes` /
`get_pnl` / `get_audit` read from, plus anything not surfaced by a tool.

- `query` — run a read-only `SELECT` (the server rejects writes; it connects
  as a read-only-capable path). Examples:
  - `SELECT vault_id, status, winning_side, realized_pnl, decided_at FROM trade_outcomes ORDER BY decided_at DESC LIMIT 50;` — raw feedback signal (compare to `get_recent_outcomes`).
  - `SELECT * FROM active_guidance;` — what guidance each vault is currently running under.
  - `SELECT id, name, mode, token_balance, created FROM vaults ORDER BY created DESC;` — vault roster.
- `schema_info` / `list_tables` / `describe_table` — discover the schema before
  querying. Tables include: `vaults`, `strategy_configs`, `keypairs`,
  `virtual_orders`, `trade_outcomes`, `active_guidance`, `pnl_snapshots`,
  `audit_events`, `engine_runs`, `market_states`, `cached_books`.

This is a **read** channel. Never attempt `INSERT`/`UPDATE`/`DELETE`/`DROP`
through it — the engine and the `polyagents` write tools own mutations.
Prefer the typed `polyagents` tools when they exist (they encode the rules in
`SOUL.md`); reach for raw SQL only to answer a question no tool covers.

## Vault resolution

`get_recent_outcomes` and `update_config` take `vault_id`. Run reflection
per-vault. If multiple vaults are active (`active_engines` lists them), loop.
