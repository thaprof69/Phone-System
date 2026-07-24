FROM node:24.14.0-bookworm-slim AS dependencies
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY apps/customer-web/package.json apps/customer-web/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/provider-simulator/package.json apps/provider-simulator/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/aios/package.json packages/aios/package.json
COPY packages/aios-adapters/package.json packages/aios-adapters/package.json
COPY packages/aios-contracts/package.json packages/aios-contracts/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/elevenlabs/package.json packages/elevenlabs/package.json
COPY packages/integrations/package.json packages/integrations/package.json
COPY packages/intelligence/package.json packages/intelligence/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/workflows/package.json packages/workflows/package.json
RUN --mount=type=cache,id=quantum-parks-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --trust-lockfile --network-concurrency=12 \
    --fetch-retries=5 --fetch-timeout=600000 --store-dir=/pnpm/store

FROM dependencies AS build
COPY . .
RUN pnpm build

FROM node:24.14.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=build --chown=node:node /workspace /workspace
USER node
CMD ["node", "apps/api/dist/main.js"]
