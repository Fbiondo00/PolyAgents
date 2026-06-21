-- Phase 3: active guidance — the closed-loop channel from OpenClaw's reflection
-- back into the engine's next AI decision. One row per vault (upserted).
-- Kept separate from strategy_configs so the learner's contextual advice doesn't
-- entangle with the strategy knob struct or the update_config path.
CREATE TABLE active_guidance (
  vault_id  TEXT PRIMARY KEY REFERENCES vaults(id) ON DELETE CASCADE,
  guidance  TEXT NOT NULL DEFAULT '',
  updated_at BIGINT NOT NULL
);
