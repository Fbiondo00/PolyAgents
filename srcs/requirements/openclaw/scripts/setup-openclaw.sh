#!/usr/bin/env bash
# setup-openclaw.sh — install PolyAgents' self-learning OpenClaw agent.
#
# Idempotent: safe to re-run. Works on macOS and Linux/VPS.
#
# What it does:
#   1. Ensures the OpenClaw CLI is installed (npm -g).
#   2. Bootstraps ~/.openclaw (openclaw config / first-run) if missing.
#   3. Copies the canonical workspace templates (SOUL.md, AGENTS.md,
#      HEARTBEAT.md, MEMORY.md, DREAMS.md, memory/, skills/) into the agent
#      workspace, preserving any existing MEMORY.md / memory notes.
#   4. Builds the poly-mcp binary (release) and registers it as the MCP server,
#      passing engine env vars from the repo .env (secrets never stored in
#      openclaw.json).
#   5. Installs the postgres-supabase read-only SQL MCP server behind a wrapper
#      that reads SUPABASE_POSTGRES_URL (falling back to DATABASE_URL) from the
#      sidecar env — the connection string is NEVER inlined in openclaw.json.
#   6. Installs the two skills.
#   7. Applies heartbeat + dreaming + skill-workshop config.
#   8. Reminds you to configure an LLM provider (heartbeat/dreaming need one);
#      the engine's OPENAI_* (Craftshost) is reused.
#
# Prereqs: node/npm, a running Postgres reachable via $DATABASE_URL, and the
# repo .env populated. Run from anywhere; paths resolve from the script location.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCLAW_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"          # srcs/requirements/openclaw
REPO_ROOT="$(cd "$OPENCLAW_DIR/../../.." && pwd)"     # PolyAgents/
ENGINE_DIR="$REPO_ROOT/srcs/requirements/engine"
ENV_FILE="$REPO_ROOT/.env"

say() { printf '\033[1;34m[setup-openclaw]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[setup-openclaw error]\033[0m %s\n' "$*" >&2; }

# --- 0. Load env (needed for MCP server registration + build) -----------------
# Parse .env line-by-line rather than `source`ing it: .env values may contain
# shell metacharacters, and we only want KEY=VALUE exports.
load_env() {
  local f="$1"
  [[ -f "$f" ]] || return 1
  local line key val
  while IFS= read -r line || [[ -n "$line" ]]; do
    # strip comments / blanks
    line="${line%%#*}"
    [[ -z "${line// }" ]] && continue
    [[ "$line" == *=* ]] || continue
    key="${line%%=*}"
    val="${line#*=}"
    # trim surrounding whitespace/quotes from key
    key="${key//[[:space:]]/}"
    # strip a single layer of surrounding quotes from val
    case "$val" in
      \"*\") val="${val#\"}"; val="${val%\"}" ;;
      \'*\') val="${val#\'}"; val="${val%\'}" ;;
    esac
    export "$key=$val"
  done < "$f"
}

if ! load_env "$ENV_FILE"; then
  err ".env not found at $ENV_FILE — populate it first (see .env.example)."
  exit 1
fi
say "loaded env from $ENV_FILE"
: "${DATABASE_URL:?DATABASE_URL must be set in .env}"
: "${VAULT_ENCRYPTION_KEY:?VAULT_ENCRYPTION_KEY must be set in .env}"

# --- 1. OpenClaw CLI ---------------------------------------------------------
if ! command -v openclaw >/dev/null 2>&1; then
  say "installing OpenClaw CLI via npm (-g)"
  npm install -g openclaw
fi
say "openclaw: $(openclaw --version 2>&1 | head -1)"

# Touch the config dir so `openclaw config` has somewhere to write. Non-interactive:
# we only set explicit keys, never run the guided wizard.
mkdir -p "$HOME/.openclaw"

# --- 2. Workspace templates --------------------------------------------------
# Resolve the workspace dir the same way OpenClaw does (default), allow override.
WORKSPACE="${OPENCLAW_WORKSPACE:-$HOME/.openclaw/workspace}"
mkdir -p "$WORKSPACE/memory" "$WORKSPACE/skills"
say "workspace: $WORKSPACE"

copy_template() {
  local rel="$1"
  local src="$OPENCLAW_DIR/workspace/$rel"
  local dst="$WORKSPACE/$rel"
  [[ -f "$src" ]] || return 0
  mkdir -p "$(dirname "$dst")"
  cp -f "$src" "$dst"
  say "wrote $rel"
}

# Memory files are append-only and precious: never overwrite MEMORY.md or an
# existing daily note. Force-copy the static persona/procedure files.
for f in SOUL.md AGENTS.md HEARTBEAT.md DREAMS.md; do
  cp -f "$OPENCLAW_DIR/workspace/$f" "$WORKSPACE/$f"; say "wrote $f"
done
[[ -f "$WORKSPACE/MEMORY.md" ]] || cp -f "$OPENCLAW_DIR/workspace/MEMORY.md" "$WORKSPACE/MEMORY.md"
# Seed today's daily note only if none exists (don't clobber real observations).
shopt -s nullglob
existing_notes=( "$WORKSPACE/memory"/*.md )
if (( ${#existing_notes[@]} == 0 )); then
  cp -f "$OPENCLAW_DIR/workspace/memory/"*.md "$WORKSPACE/memory/" 2>/dev/null || true
  say "seeded initial daily note"
fi
shopt -u nullglob

# --- 3. Build poly-mcp (release) --------------------------------------------
say "building poly-mcp (release)…"
( cd "$ENGINE_DIR" && cargo build --release -p poly-mcp )
MCP_BIN="$ENGINE_DIR/target/release/poly-mcp"
[[ -x "$MCP_BIN" ]] || { err "poly-mcp not built at $MCP_BIN"; exit 1; }

# --- 4. Register MCP server --------------------------------------------------
# Secrets live in a sidecar env file (~/.openclaw/polyagents.env, mode 0600),
# NOT inline in openclaw.json. The MCP server loads it on boot via its dotenv
# loader (poly-mcp/src/dotenv.rs). This keeps openclaw.json secret-free.
SIDECAR="$HOME/.openclaw/polyagents.env"
mkdir -p "$(dirname "$SIDECAR")"
cp -f "$ENV_FILE" "$SIDECAR"
chmod 600 "$SIDECAR"
say "wrote sidecar env (mode 0600): $SIDECAR"

say "registering MCP server 'polyagents'"
# Remove + re-add so the registration stays in sync on re-runs.
openclaw mcp unset polyagents >/dev/null 2>&1 || true
openclaw mcp add polyagents \
  --command "$MCP_BIN" \
  --no-probe \
  --env "POLYAGENTS_ENV_FILE=$SIDECAR" \
  >/dev/null

# --- 4b. Register postgres-supabase (read-only SQL) ------------------------
# Documented in workspace/AGENTS.md (query / schema_info / list_tables /
# describe_table). Backed by @modelcontextprotocol/server-postgres, but wrapped
# so the Postgres connection string (which embeds a password) is NEVER inlined
# in openclaw.json or passed on the CLI. The wrapper reads
# SUPABASE_POSTGRES_URL (falling back to DATABASE_URL) from the sidecar env at
# boot and exports it as the connection string the server reads.
PG_WRAPPER_DIR="$HOME/.openclaw/bin"
PG_WRAPPER="$PG_WRAPPER_DIR/postgres-mcp.sh"
mkdir -p "$PG_WRAPPER_DIR"

cat > "$PG_WRAPPER" <<'WRAPPER'
#!/usr/bin/env bash
# postgres-mcp.sh — launch the read-only postgres MCP server for OpenClaw.
#
# Connection string is sourced from the PolyAgents sidecar env (never inlined).
# Looks for SUPABASE_POSTGRES_URL first (the read-only/inspector path), then
# falls back to DATABASE_URL. POLYAGENTS_ENV_FILE is set by the MCP registration
# to ~/.openclaw/polyagents.env (mode 0600, written by setup-openclaw.sh).
set -euo pipefail

ENV_FILE="${POLYAGENTS_ENV_FILE:-$HOME/.openclaw/polyagents.env}"

# Parse the sidecar for the connection string (do NOT source it — values may
# contain shell metacharacters; we only need the URL).
pg_url=""
if [[ -f "$ENV_FILE" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%#*}"
    [[ -z "${line// }" ]] && continue
    case "$line" in
      SUPABASE_POSTGRES_URL=*)
        pg_url="${line#SUPABASE_POSTGRES_URL=}"; pg_url="${pg_url//\'}"; pg_url="${pg_url//\"}"
        break ;;
      DATABASE_URL=*)
        [[ -z "$pg_url" ]] && { pg_url="${line#DATABASE_URL=}"; pg_url="${pg_url//\'}"; pg_url="${pg_url//\"}"; } ;;
    esac
  done < "$ENV_FILE"
fi

if [[ -z "$pg_url" ]]; then
  printf '[postgres-mcp] no SUPABASE_POSTGRES_URL or DATABASE_URL in %s\n' "$ENV_FILE" >&2
  exit 1
fi

# Prefer a locally installed server; fall back to npx (downloads on first run).
if command -v mcp-server-postgres >/dev/null 2>&1; then
  exec mcp-server-postgres "$pg_url"
fi
exec npx --yes "@modelcontextprotocol/server-postgres" "$pg_url"
WRAPPER
chmod 755 "$PG_WRAPPER"
say "wrote postgres MCP wrapper: $PG_WRAPPER"

say "registering MCP server 'postgres-supabase'"
# Remove + re-add so the registration stays in sync on re-runs. The connection
# string is NOT passed here — the wrapper reads it from the sidecar.
openclaw mcp unset postgres-supabase >/dev/null 2>&1 || true
openclaw mcp add postgres-supabase \
  --command "$PG_WRAPPER" \
  --no-probe \
  --env "POLYAGENTS_ENV_FILE=$SIDECAR" \
  >/dev/null

# --- 5. Install skills -------------------------------------------------------
say "installing skills"
openclaw skills install "$OPENCLAW_DIR/skills/polyagents-reflect" --as polyagents-reflect --force >/dev/null
openclaw skills install "$OPENCLAW_DIR/skills/polyagents-trading-cycle" --as polyagents-trading-cycle --force >/dev/null

# --- 6. Apply config (heartbeat + dreaming + workshop) -----------------------
say "applying heartbeat / dreaming / workshop config"
openclaw config set agents.defaults.heartbeat.every '"20m"' --strict-json >/dev/null
openclaw config set agents.defaults.heartbeat.prompt \
  '"Run the polyagents-reflect skill. Read HEARTBEAT.md and AGENTS.md for procedure. If nothing needs attention after observing recent outcomes, reply HEARTBEAT_OK."' \
  --strict-json >/dev/null
openclaw config set agents.defaults.heartbeat.lightContext true --strict-json >/dev/null
openclaw config set agents.defaults.heartbeat.isolatedSession true --strict-json >/dev/null
openclaw config set agents.defaults.heartbeat.skipWhenBusy true --strict-json >/dev/null

openclaw config set plugins.entries.memory-core.config.dreaming.enabled true --strict-json >/dev/null
openclaw config set plugins.entries.memory-core.config.dreaming.frequency '"0 3 * * *"' --strict-json >/dev/null

openclaw config set skills.workshop.autonomous.enabled true --strict-json >/dev/null
openclaw config set skills.workshop.approvalPolicy '"auto"' --strict-json >/dev/null

# --- 7b. Probe MCP servers (fail fast on a broken binary/wrapper) -----------
# setup uses --no-probe during registration for speed; probe now so a runtime
# failure (missing dynamic lib, bad wrapper, unreachable DB) surfaces here
# instead of on the first silent heartbeat. Treat a probe failure as fatal.
for srv in polyagents postgres-supabase; do
  if openclaw mcp probe "$srv" >/dev/null 2>&1; then
    say "mcp probe ok: $srv"
  else
    err "mcp probe FAILED for '$srv' — run 'openclaw mcp probe $srv' for details"
    exit 1
  fi
done

# --- 8. LLM provider reminder ----------------------------------------------
# The heartbeat + dreaming turns need an LLM; the MCP/skill wiring above is
# useless without one. We do NOT write a key into openclaw.json (secret-free).
# Reuse the engine's Craftshost (OpenAI-compatible) gateway already in .env:
#   openclaw configure   # point at https://openai.craftshost.com + OPENAI_API_KEY
# or set it directly:
#   openclaw config set model.provider '"openai"'
#   openclaw config set model.baseURL  '"https://openai.craftshost.com"'
#   openclaw config set model.model    "\"$OPENAI_MODEL\""
if [[ -z "$(openclaw config get model.provider 2>/dev/null)" ]]; then
  err "no LLM provider configured — heartbeat/dreaming will produce nothing."
  err "  run 'openclaw configure' (point at the Craftshost gateway, reusing OPENAI_*)."
fi

say "done. Next: start the engine + Postgres, then run 'openclaw chat' or 'openclaw agent'."
say "verify:  openclaw mcp list   |   openclaw skills list   |   openclaw config get agents.defaults.heartbeat"
