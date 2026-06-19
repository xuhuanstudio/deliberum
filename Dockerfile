# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS deps

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends git python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/cli/package.json apps/cli/package.json
COPY apps/daemon/package.json apps/daemon/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/adapters/package.json packages/adapters/package.json
COPY packages/client/package.json packages/client/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/evaluation/package.json packages/evaluation/package.json
COPY packages/orchestrator/package.json packages/orchestrator/package.json
COPY packages/protocol/package.json packages/protocol/package.json
COPY packages/resources/package.json packages/resources/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN pnpm install --frozen-lockfile
RUN pnpm exec playwright install --with-deps chromium

FROM deps AS build

COPY . .

RUN git init --quiet && git add -A && pnpm run ci && rm -rf .git
RUN CI=true pnpm prune --prod

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
  DELIBERUM_HOST=0.0.0.0 \
  DELIBERUM_PORT=3877 \
  DELIBERUM_DAEMON_SQLITE_PATH=/data/deliberum.sqlite \
  DELIBERUM_DAEMON_WEB_ASSETS_PATH=/app/apps/web/dist

WORKDIR /app

RUN corepack enable \
  && groupadd --system deliberum \
  && useradd --system --gid deliberum --home-dir /app --shell /usr/sbin/nologin deliberum \
  && mkdir -p /data \
  && chown -R deliberum:deliberum /app /data

COPY --from=build --chown=deliberum:deliberum /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/.npmrc ./
COPY --from=build --chown=deliberum:deliberum /app/node_modules ./node_modules
COPY --from=build --chown=deliberum:deliberum /app/apps ./apps
COPY --from=build --chown=deliberum:deliberum /app/packages ./packages

USER deliberum

EXPOSE 3877
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.DELIBERUM_PORT || '3877') + '/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "apps/daemon/dist/index.js"]
