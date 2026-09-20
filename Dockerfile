FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY index.html vite.config.ts nitro.config.ts tsconfig*.json ./
COPY tailwind.config.ts postcss.config.js components.json ./
COPY src ./src
COPY public ./public
COPY server ./server
ENV NITRO_PRESET=node-server
RUN pnpm run build && test -f .output/server/index.mjs

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.output ./.output
USER node
EXPOSE 3000
CMD ["sh", "-c", "export NITRO_HOST=0.0.0.0 NITRO_PORT=${PORT:-3000}; exec node .output/server/index.mjs"]
