FROM oven/bun:1-debian AS runtime-deps
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

RUN bun install --frozen-lockfile --production

FROM oven/bun:1-debian
WORKDIR /app
ENV NODE_ENV=production

COPY --from=runtime-deps /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.base.json turbo.json ./
COPY packages ./packages
COPY apps/worker ./apps/worker

EXPOSE 3001
CMD ["bun", "apps/worker/src/index.ts"]
