FROM node:20-bookworm-slim AS deps
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=true
COPY package*.json ./
RUN npm ci --no-audit --no-fund

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000 \
    NODE_OPTIONS="--max-old-space-size=384"

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=builder /app/dist ./dist

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs runner \
  && chown -R runner:nodejs /app
USER runner

EXPOSE 4000
CMD ["node", "dist/server/index.js"]
