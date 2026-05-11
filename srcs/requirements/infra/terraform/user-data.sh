#!/bin/bash
set -euo pipefail

# PolyAgents engine — EC2 first-boot bootstrap
# Installs Rust, clones repo, builds engine, starts as systemd service

export DEBIAN_FRONTEND=noninteractive

# ── System packages ───────────────────────────────────────────────────
apt-get update -qq
apt-get install -y -qq build-essential pkg-config libssl-dev git curl postgresql-client

# ── Rust ──────────────────────────────────────────────────────────────
if ! command -v cargo &>/dev/null; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source /root/.cargo/env
fi

# ── Application ───────────────────────────────────────────────────────
mkdir -p /opt/polyagents
cd /opt/polyagents

# Write env file
cat > /opt/polyagents/.env <<'ENVEOF'
DATABASE_URL="${database_url}"
OPENAI_API_BASE=https://openai.pezserv.org
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o
OPENAI_MAX_TOKENS=1024
POLYMARKET_LIVE=false
ENVEOF

# Build engine (binary must be deployed separately via SCP or CI)
# For now, assume the binary is pre-built and uploaded to /opt/polyagents/engine
mkdir -p /opt/polyagents/engine/migrations

# ── systemd unit ──────────────────────────────────────────────────────
cat > /etc/systemd/system/polyagents-engine.service <<'EOF'
[Unit]
Description=PolyAgents Trading Engine
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/polyagents/engine
EnvironmentFile=/opt/polyagents/.env
ExecStart=/opt/polyagents/engine/polyagents-engine --host 0.0.0.0 --port ${engine_port}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable polyagents-engine

echo "PolyAgents engine bootstrap complete. Deploy binary to /opt/polyagents/engine/ and run: systemctl start polyagents-engine"
