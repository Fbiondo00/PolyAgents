# HEARTBEAT — PolyAgents reflection checklist

Read on every heartbeat turn. Follow it strictly. Do not infer tasks from prior
chats. If nothing needs attention, reply `HEARTBEAT_OK`.

## Reflect on feedback

1. Call `active_engines`. For each active vault:
   - Call `get_recent_outcomes` (limit 20).
   - Focus on rows that flipped to **RECONCILED** since the last beat (these
     carry `winning_side` + `realized_pnl`). Skip OPEN rows unless they're old.
   - For each new RECONCILED outcome: note decision bias/confidence vs the
     realized result. Did the both-side spread capture actually work, or did one
     side expire worthless?
2. If a clear, actionable pattern shows up across ≥2 outcomes:
   - Contextual advice for the engine AI → `set_active_guidance`.
   - Numeric tunable → `update_config`.
   Otherwise just record the observation in `memory/YYYY-MM-DD.md`.
3. If no new reconciled outcomes since last beat → `HEARTBEAT_OK`.

## Safety sweep (cheap, every beat)

- Any vault whose recent PnL is trending toward `max_drawdown_usdc`? If so,
  `stop_engine` for that vault and surface it (don't silently tighten).
- Anything in `DREAMS.md` that's clearly wrong? Reject it.

## Tone

One beat = one focused observation + at most one adjustment. Don't stack five
config changes on thin evidence. Patience compounds.
