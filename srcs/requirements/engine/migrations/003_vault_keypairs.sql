-- Per-vault agent keypairs for non-custodial trading
-- Each vault gets its own EOA; private key encrypted with AES-256-GCM

CREATE TABLE vault_keypairs (
  vault_id TEXT PRIMARY KEY REFERENCES vaults(id) ON DELETE CASCADE,
  encrypted_private_key BYTEA NOT NULL,
  public_address TEXT NOT NULL UNIQUE,
  key_salt TEXT NOT NULL,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX idx_keypairs_address ON vault_keypairs(public_address);

ALTER TABLE vaults ADD COLUMN IF NOT EXISTS agent_address TEXT;
