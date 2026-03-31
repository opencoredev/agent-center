FROM oven/bun:1-debian AS build
WORKDIR /app

COPY package.json bun.lock ./
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

COPY packages ./packages
COPY apps/web ./apps/web
COPY tsconfig.base.json ./

RUN cd apps/web && bunx --bun vite build

FROM oven/bun:1-debian
WORKDIR /app
RUN bun add serve
COPY --from=build /app/apps/web/dist ./dist
CMD ["sh", "-c", "bunx serve dist -s -l ${PORT:-3000}"]
