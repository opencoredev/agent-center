FROM oven/bun:1.3.5-debian AS build
WORKDIR /app
ENV CI=1

ARG VITE_API_URL=
ARG VITE_AUTH_ENABLED=true
ARG VITE_CONVEX_URL=
ARG VITE_ZERO_ENABLED=false
ARG VITE_ZERO_CACHE_URL=
ENV NODE_ENV=production
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_AUTH_ENABLED=$VITE_AUTH_ENABLED
ENV VITE_CONVEX_URL=$VITE_CONVEX_URL
ENV VITE_ZERO_ENABLED=$VITE_ZERO_ENABLED
ENV VITE_ZERO_CACHE_URL=$VITE_ZERO_CACHE_URL

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

COPY packages ./packages
COPY apps/control-plane ./apps/control-plane
COPY apps/web ./apps/web
RUN cd apps/web && bunx --bun vite build

FROM nginx:1.27-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
RUN printf 'server { listen 3000; root /usr/share/nginx/html; location / { try_files $uri $uri/ /index.html; } }\n' > /etc/nginx/conf.d/default.conf
EXPOSE 3000
