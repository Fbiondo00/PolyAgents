# syntax=docker/dockerfile:1
# PolyAgents Rust engine — multi-stage build.
#
# Produces two static-ish binaries:
#   polyagents-engine  — axum HTTP API + trading state machine + reconciler (:8080)
#   poly-mcp           — MCP server over stdio (launched by OpenClaw on the host)
#
# Both read their config from environment variables only (AppConfig::from_env).
# No secrets are baked into the image — pass them at runtime via env_file.
# Migrations are compiled into the binary (sqlx::migrate!("./migrations")) and
# applied on boot, so the image needs no migration volume.

# ── Stage 1: build ──────────────────────────────────────────────────────
FROM rust:1-bookworm AS builder

# sqlx's compile-time `query!` macros are NOT used here (queries are runtime),
# so no SQLX_OFFLINE / prepared-data step is required.
ENV CARGO_TERM_COLOR=always

WORKDIR /build

# Copy the full workspace. Dependency rebuilds are cached across builds by the
# BuildKit cache mounts below (registry + target dir), so source edits don't
# force a full recompile of the dependency tree on a warm builder.
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
COPY src ./src
COPY migrations ./migrations

RUN mkdir -p /out

# Build both release binaries. --package disambiguates the two bin targets
# (polyagents-engine lives in the root package, poly-mcp in a subcrate).
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/build/target \
    cargo build --release --package polyagents-engine --bin polyagents-engine && \
    cargo build --release --package poly-mcp --bin poly-mcp && \
    cp /build/target/release/polyagents-engine /build/target/release/poly-mcp /out/

# ── Stage 2: runtime ────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

# reqwest's default features pull in native-tls → needs libssl3 + CA bundle.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        libssl3 \
        tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /out/polyagents-engine /usr/local/bin/polyagents-engine
COPY --from=builder /out/poly-mcp /usr/local/bin/poly-mcp

# Non-root user for the engine HTTP server.
RUN useradd --system --no-create-home --uid 10001 polyagents
USER polyagents

# Sanity: confirm the engine binary parses its CLI. (poly-mcp takes no flags —
# it reads only env + stdin — so just trust the COPY above for it.)
RUN polyagents-engine --help >/dev/null

# Default: run the HTTP engine. The MCP server is launched separately (see
# compose `mcp` profile / openclaw.json `command`).
EXPOSE 8080

# tini reaps zombie processes and forwards SIGTERM for graceful shutdown
# (the engine stops all active vaults on SIGTERM).
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["polyagents-engine", "--host", "0.0.0.0", "--port", "8080"]
