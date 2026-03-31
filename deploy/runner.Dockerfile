FROM oven/bun:1-debian
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    git zsh ca-certificates curl openssh-client \
  && rm -rf /var/lib/apt/lists/*

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
COPY apps/runner ./apps/runner
COPY tsconfig.base.json ./

CMD ["bun", "apps/runner/src/index.ts"]
