# PolyAgents × OpenClaw — self-learning trading loop

This is the **learning layer**: an OpenClaw agent that watches the engine's
decision→outcome feedback signal, reflects on what made or lost money, and feeds
guidance back so the next cycle is smarter. The Rust engine owns the fast hot
loop (discover → decide → place bids → reconcile); OpenClaw owns the slow
reflection loop. They talk only through MCP + Postgres.

```
            ┌──────────────── Rust engine (fast, every 5s) ────────────────┐
            │  discover market → AI decision → place $0.01 bids            │
            │        ↓                                                       │
            │  trade_outcomes (OPEN at decision time)                       │
            │        ↓ reconciler (30s sweep)                               │
            │  trade_outcomes (RECONCILED: winning_side + realized_pnl)     │
            └────────────────────────────┬──────────────────────────────────┘
                                         │ get_recent_outcomes (MCP)
            ┌──────────── OpenClaw (slow, every 20min heartbeat) ───────────┐
            │  reflect skill → observe outcomes → reflect → record          │
            │        ↓                                                       │
            │  memory/YYYY-MM-DD.md (raw observations)                      │
            │        ↓ dreaming (daily 03:00)                               │
            │  MEMORY.md (durable lessons, injected every session)          │
            │        ↓                                                       │
            │  set_active_guidance / update_config  →  next AI decision     │
            └───────────────────────────────────────────────────────────────┘
```

## One-command setup

```bash
bash srcs/requirements/openclaw/scripts/setup-openclaw.sh
```

Idempotent; safe on macOS and Linux/VPS. It:

1. Installs the OpenClaw CLI (`npm i -g openclaw`) if missing.
2. Copies the canonical workspace templates into `~/.openclaw/workspace/`
   (persona/procedure files force-updated; `MEMORY.md` and daily notes preserved).
3. Builds `poly-mcp` (release) and registers it as the `polyagents` MCP server.
4. Copies `.env` → `~/.openclaw/polyagents.env` (mode 0600). **Secrets live only
   there** — `~/.openclaw/openclaw.json` stays secret-free; `poly-mcp` loads the
   sidecar on boot via its dotenv loader (`POLYAGENTS_ENV_FILE`).
5. Installs the two skills and applies heartbeat + dreaming + skill-workshop config.

Verify after running:

```bash
openclaw mcp list                 # → polyagents
openclaw mcp probe polyagents     # → 16 tools
openclaw skills list | grep poly  # → polyagents-reflect, polyagents-trading-cycle (ready)
openclaw config get agents.defaults.heartbeat
```

## Prerequisites

- **Postgres** reachable via `DATABASE_URL` in `.env`, with migrations applied
  (the engine applies them on boot).
- **The engine running** for live outcomes. Start it:
  `cargo run --bin polyagents-engine` (from `srcs/requirements/engine`), or run
  it as a service on the VPS. The reconciler must be able to reach
  `gamma-api.polymarket.com` to resolve markets.
- **A model provider in OpenClaw.** The heartbeat/agent turns need an LLM. The
  engine's AI uses Craftshost (Ollama/Langfuse) via `OPENAI_*`; OpenClaw's own
  turns use whatever provider you configure (`openclaw configure`). Point OpenClaw
  at the same Craftshost gateway, or any provider you have a key for.

## The workspace files (source of truth)

These live in `workspace/` in the repo and are copied into `~/.openclaw/workspace/`
by the setup script. Edit them here, re-run the script to sync.

- **`SOUL.md`** — persona + **hard risk constraints** (action-sensitive): never
  place live orders yourself, never bid > $0.50, never disable `max_drawdown_usdc`,
  never enable live trading without human sign-off. Full autonomy *within* those
  ceilings.
- **`AGENTS.md`** — operating procedure: the learning loop, memory discipline,
  the real tool inventory (no ghost tools).
- **`HEARTBEAT.md`** — the checklist read each 20-min heartbeat turn.
- **`MEMORY.md`** — curated durable rules (auto-injected each session; keep short).
- **`memory/YYYY-MM-DD.md`** — raw daily reflection notes.
- **`DREAMS.md`** — dreaming's human-review queue.

## The skills

- **`skills/polyagents-reflect/`** — the learning turn. Observe recent outcomes
  → reflect → record → at most one bounded adjustment. Driven by the heartbeat.
- **`skills/polyagents-trading-cycle/`** — read-only review of a vault's live
  state (engine status, open orders, PnL, recent outcomes, audit).

## Configuration reference

`openclaw.json` here is a **reference** of what the setup script installs (OpenClaw
reads `~/.openclaw/openclaw.json`, not this file). It documents the MCP server
registration, the 20-min heartbeat, dreaming (daily 03:00 promotion of daily
notes → `MEMORY.md`), and the skill-workshop autonomy (full: agent may draft and
auto-apply proposals).

## Autonomy model (decided)

**Full autonomy, auto-apply.** The agent may edit any strategy param via
`update_config`, write contextual advice via `set_active_guidance`, and draft +
auto-apply skill-workshop proposals. Risk is bounded by the SOUL.md ceilings.
This maximizes learning speed; dial it back by setting
`skills.workshop.approvalPolicy` to `"pending"` if you want proposals to queue
for review instead.

## Loop driver (decided)

**Heartbeat** (in-session, every 20 min) reads `HEARTBEAT.md` and runs
`polyagents-reflect`. Markets resolve every 5 min, so batched reflection is more
signal-dense than per-cycle. Add a detached `openclaw cron` job as a 24/7
fallback if you want reflection independent of an open chat session.
