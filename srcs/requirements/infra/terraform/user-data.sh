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

# Write env file.
# OPENAI_API_KEY is emitted as a real assignment only when a key is supplied
# via Terraform; otherwise it is written as a commented placeholder so the
# engine fails loudly (missing var) instead of silently 401-ing on an empty key.
# OPENAI_API_BASE points at the craftshost gateway by default.
cat > /opt/polyagents/.env <<ENVEOF
DATABASE_URL="${database_url}"
OPENAI_API_BASE=${openai_api_base}
${openai_key_line}
OPENAI_MODEL=${openai_model}
OPENAI_MAX_TOKENS=4096
POLYMARKET_LIVE=false
ENVEOF
chmod 600 /opt/polyagents/.env

# Build engine (binary must be deployed separately via SCP or CI)
# For now, assume the binary is pre-built and uploaded to /opt/polyagents/engine
mkdir -p /opt/polyagents/engine/migrations

# ── RDS readiness probe ──────────────────────────────────────────────
# On first boot the EC2 host may come up before RDS accepts connections.
# systemd references this one-shot unit via After=/Requires= so the engine
# does not start (and crash-loop) until PostgreSQL answers.
cat > /opt/polyagents/wait-for-db.sh <<EOF
#!/bin/bash
# Wait until the RDS PostgreSQL endpoint accepts a TCP connection.
HOST="${db_host}"
PORT="${db_port}"
TIMEOUT=300
for i in $(seq 1 "$TIMEOUT"); do
  if pg_isready -h "$HOST" -p "$PORT" -t 3 >/dev/null 2>&1; then
    echo "RDS reachable at $HOST:$PORT"
    exit 0
  fi
  sleep 2
done
echo "RDS at $HOST:$PORT not reachable within $TIMEOUT s" >&2
exit 1
EOF
chmod +x /opt/polyagents/wait-for-db.sh

cat > /etc/systemd/system/polyagents-db-ready.service <<'EOF'
[Unit]
Description=Wait for RDS PostgreSQL to accept connections
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/opt/polyagents/wait-for-db.sh
RemainAfterExit=yes
TimeoutStartSec=360

[Install]
WantedBy=multi-user.target
EOF

# ── systemd unit ──────────────────────────────────────────────────────
# Unquoted heredoc so Terraform can interpolate ${engine_port}; the unit body
# contains no other $ characters.
cat > /etc/systemd/system/polyagents-engine.service <<EOF
[Unit]
Description=PolyAgents Trading Engine
# Do not start the engine until the network is up AND RDS is confirmed ready.
# Requires= ensures that if the DB readiness probe fails, the engine does not run.
After=network-online.target polyagents-db-ready.service
Requires=network-online.target polyagents-db-ready.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/polyagents/engine
EnvironmentFile=/opt/polyagents/.env
ExecStartPre=/opt/polyagents/wait-for-db.sh
ExecStart=/opt/polyagents/engine/polyagents-engine --host 0.0.0.0 --port ${engine_port}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable polyagents-db-ready.service
systemctl enable polyagents-engine

echo "PolyAgents engine bootstrap complete. Deploy binary to /opt/polyagents/engine/ and run: systemctl start polyagents-engine"
