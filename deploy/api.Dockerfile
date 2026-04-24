FROM oven/bun:1.3.5-debian AS workspace
WORKDIR /app
ENV CI=1

COPY package.json bun.lock tsconfig.base.json turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/control-plane/package.json apps/control-plane/package.json
COPY apps/runner/package.json apps/runner/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/github/package.json packages/github/package.json
COPY packages/sdk-ts/package.json packages/sdk-ts/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN bun install --frozen-lockfile

FROM workspace AS web-build
ARG VITE_API_URL=
ARG VITE_AUTH_ENABLED=true
ARG VITE_ZERO_ENABLED=false
ARG VITE_ZERO_CACHE_URL=
ENV NODE_ENV=production
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_AUTH_ENABLED=$VITE_AUTH_ENABLED
ENV VITE_ZERO_ENABLED=$VITE_ZERO_ENABLED
ENV VITE_ZERO_CACHE_URL=$VITE_ZERO_CACHE_URL

COPY packages ./packages
COPY apps/control-plane ./apps/control-plane
COPY apps/web ./apps/web
RUN cd apps/web && bunx --bun vite build

FROM oven/bun:1.3.5-debian AS runtime-deps
WORKDIR /app
ENV CI=1
ENV NODE_ENV=production

COPY package.json bun.lock tsconfig.base.json turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/control-plane/package.json apps/control-plane/package.json
COPY apps/runner/package.json apps/runner/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/github/package.json packages/github/package.json
COPY packages/sdk-ts/package.json packages/sdk-ts/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN bun install --frozen-lockfile

FROM oven/bun:1.3.5-debian
WORKDIR /app
ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=3100
ENV SERVE_FRONTEND=true
ENV FRONTEND_DIST_PATH=/app/apps/web/dist

COPY --from=runtime-deps /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.base.json turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/control-plane ./apps/control-plane
COPY --from=web-build /app/apps/web/dist ./apps/web/dist

EXPOSE 3100
CMD ["bun", "apps/api/src/index.ts"]
