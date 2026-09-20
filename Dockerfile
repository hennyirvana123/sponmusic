FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

ENV NITRO_PRESET=node-server
RUN pnpm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0

COPY --from=build /app/.output ./.output

USER node

CMD ["sh", "-c", "export NITRO_HOST=0.0.0.0 NITRO_PORT=${PORT:-3000}; exec node .output/server/index.mjs"]
