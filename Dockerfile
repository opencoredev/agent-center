# ── Stage 1: Install dependencies ─────────────────────────────────────────
FROM oven/bun:1-debian AS base
WORKDIR /app

COPY package.json bun.lock turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/runner/package.json apps/runner/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/github/package.json packages/github/package.json
COPY packages/sdk-ts/package.json packages/sdk-ts/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN bun install --frozen-lockfile

# ── Stage 2: Build everything ────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

COPY . .

# Build the frontend (vite needs devDeps which are already installed)
RUN cd apps/web && bunx --bun vite build

# ── Stage 3: API (serves frontend in production) ─────────────────────────
FROM oven/bun:1-debian AS api
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/api ./apps/api
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/packages ./packages

ENV SERVE_FRONTEND=true
ENV FRONTEND_DIST_PATH=apps/web/dist

EXPOSE 3100
CMD ["sh", "-c", "bun packages/db/src/migrate.ts && bun apps/api/src/index.ts"]

# ── Stage 4: Worker ──────────────────────────────────────────────────────
FROM oven/bun:1-debian AS worker
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/worker ./apps/worker
COPY --from=builder /app/packages ./packages

CMD ["bun", "apps/worker/src/index.ts"]

# ── Stage 5: Runner (needs git + shell tools) ────────────────────────────
FROM oven/bun:1-debian AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    zsh \
    ca-certificates \
    curl \
    openssh-client \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/runner ./apps/runner
COPY --from=builder /app/packages ./packages

EXPOSE 3002
CMD ["bun", "apps/runner/src/index.ts"]

# ── Stage 6: Web (static frontend via serve) ─────────────────────────────
FROM oven/bun:1-debian AS web
WORKDIR /app

RUN bun add serve

COPY --from=builder /app/apps/web/dist ./dist

EXPOSE 3000
CMD ["bunx", "serve", "dist", "-s", "-l", "3000"]

# ── Stage 7: Migrator (run migrations and seed, then exit) ───────────────
FROM oven/bun:1-debian AS migrator
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages ./packages

CMD ["bun", "packages/db/src/migrate.ts"]
