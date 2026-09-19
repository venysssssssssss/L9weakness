# ---- build: compile TS, native addons (canvas/opus/sqlite) ----
FROM node:20-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 python-is-python3 make g++ pkg-config \
  libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev libopus-dev \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY discord-bot/package.json discord-bot/package-lock.json* ./
RUN npm ci
COPY discord-bot/ ./
RUN npm run build && npm prune --omit=dev

# ---- runtime: shared libs the addons link against; ffmpeg comes from ffmpeg-static (npm), exposed on PATH ----
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 python-is-python3 libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 libopus0 \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./
RUN ln -s /app/node_modules/ffmpeg-static/ffmpeg /usr/local/bin/ffmpeg
RUN mkdir -p data logs
ENV NODE_ENV=production
CMD ["node", "--max-old-space-size=384", "index.js"]
