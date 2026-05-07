# Data Storage

PolyAgents uses a dual data layer: Supabase (PostgreSQL) for backend persistence and localStorage for frontend demo state.

## Supabase (Primary Backend)

Local Supabase provides a full PostgreSQL database with typed queries for all vault and engine data.

**Location:** `srcs/requirements/supabase/` — contains `config.toml` and `migrations/`.

### Tables

| Table | Purpose |
|-------|---------|
| `vaults` | Vault metadata, strategy config, funding, inventory |
| `engine_runs` | Running/stopped engine instances |
| `engine_orders` | All virtual orders (open, filled, cancelled) |
| `engine_market_states` | Per-market side ledgers and state |
| `engine_pnl_snapshots` | PnL snapshots over time |
| `engine_audit` | Full audit trail for every engine action |
| `engine_configs` | Strategy parameter snapshots |
| `engine_books` | Order book snapshots per cycle |

### SDK Queries

All database operations live in `@polyagents/sdk` → `modules/supabase/queries.ts`. These use generated types from `@polyagents/schema` → `types/database.ts` (produced by `supabase gen types typescript --local`).

```typescript
import { createServerClient } from "@polyagents/sdk/modules/supabase/client";
import { getVault, insertVault, getEngineOrders } from "@polyagents/sdk/modules/supabase/queries";
```

### Setup

```bash
cd srcs/requirements/supabase
supabase start     # Starts PostgreSQL, Auth, Realtime on 127.0.0.1:54321
supabase stop      # Stop containers
```

Environment variables (auto-configured by `supabase start`):
- `SUPABASE_URL` — defaults to `http://127.0.0.1:54321`
- `SUPABASE_SERVICE_ROLE_KEY` — printed by `supabase start`

## localStorage (Frontend Demo)

The frontend uses localStorage for client-side state that persists across reloads without a backend. This is the legacy/fallback layer.

**Keys:**
- `polyagents.vaults` — serialized `Vault[]`
- `polyagents.selectedVaultId`
- `polyagents.demoVaultCreated`
- `polyagents.engine.runs`, `.orders`, `.states`, `.pnl`, `.audits`, `.books`, `.configs`

**SDK modules:** `@polyagents/sdk` → `modules/engine/repositories.ts` and `modules/store/`.

## When to Use Which

| Scenario | Use Supabase | Use localStorage |
|----------|-------------|-------------------|
| Backend / MCP server | Yes | No |
| Frontend demo without Supabase running | No | Yes |
| Multi-session persistence | Yes | Yes (same browser) |
| Cross-device access | Yes | No |
