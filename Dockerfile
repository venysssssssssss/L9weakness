FROM node:20-bookworm-slim

# System deps for canvas, opus, ffmpeg, better-sqlite3
RUN apt-get update && apt-get install -y \
  python3 make g++ \
  libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev \
  libopus-dev ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps
COPY discord-bot/package.json discord-bot/package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy bot
COPY discord-bot/ ./

# Create data & logs dirs
RUN mkdir -p data logs

ENV NODE_ENV=production

CMD ["node", "-r", "ts-node/register", "index.ts"]
