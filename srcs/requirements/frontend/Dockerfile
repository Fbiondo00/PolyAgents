# syntax=docker/dockerfile:1
# PolyAgents frontend — Next.js 16 standalone production image.
#
# Standalone output (next.config.mjs `output: "standalone"`) bundles only the
# required node_modules into .next/standalone, so the runtime image needs no
# full node_modules copy and runs `node server.js` directly.
#
# NEXT_PUBLIC_* vars are baked at BUILD time (Next inlines public env). Use a
# build arg for the engine URL so the bundle points at the right host. Runtime
# secrets (Supabase service-role key) are injected at run via env_file.

# ── Stage 1: deps ───────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS deps
# Some transitive deps (utf-8-validate, bufferutil via ws) compile native
# addons with node-gyp → need Python + a C++ toolchain in this stage only.
# The runtime stage stays slim; these never ship.
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# ── Stage 2: build ──────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* is inlined into the client bundle at build time.
# In compose the frontend reaches the engine over the docker network, so the
# browser-visible URL must be the externally-exposed host (override per-deploy).
#
# Privy's provider throws during prerender if NEXT_PUBLIC_PRIVY_APP_ID is empty,
# which breaks `next build` (static generation of /_not-found). The placeholders
# below let the build succeed; a real deploy MUST override them with real build
# args (they are baked into the client bundle — runtime env cannot change them).
ARG NEXT_PUBLIC_ENGINE_URL=http://localhost:8080
ARG NEXT_PUBLIC_SUPABASE_URL=http://placeholder.invalid
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder
ARG NEXT_PUBLIC_PRIVY_APP_ID=placeholder-build-only
ENV NEXT_PUBLIC_ENGINE_URL=$NEXT_PUBLIC_ENGINE_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_PRIVY_APP_ID=$NEXT_PUBLIC_PRIVY_APP_ID \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ── Stage 3: runtime ────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Standalone server + static assets + public dir.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

RUN useradd --system --no-create-home --uid 10001 nextjs
USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
