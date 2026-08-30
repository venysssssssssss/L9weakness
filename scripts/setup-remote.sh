#!/usr/bin/env bash
set -e

# Setup inicial para VPS kali1/kali2 (Ubuntu 20.04+)
# Uso: ./scripts/setup-remote.sh kali1
# Instala: Node 20, PM2, Docker, git, clone repo

TARGET="${1:-kali1}"
REMOTE_DIR="/home/ubuntu/L9weakness"

echo "🔧 Setup remoto $TARGET → $REMOTE_DIR"

ssh "$TARGET" bash <<'EOSSH'
set -e
echo "📦 Atualizando apt..."
sudo apt-get update -y
sudo apt-get install -y curl git build-essential python3 make g++ \
  libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev \
  libopus-dev ffmpeg

echo "🟢 Instalando Node 20 via NVM..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v
npm -v

echo "📦 PM2..."
sudo npm install -g pm2
pm2 --version

echo "🐳 Docker (se não existir)..."
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker $USER
fi
docker --version
docker compose version 2>&1 | head -n 1

echo "📁 Clone repo..."
if [ ! -d /home/ubuntu/L9weakness/.git ]; then
  git clone https://github.com/venysssssssssss/L9weakness.git /home/ubuntu/L9weakness
fi

echo "✅ Setup $HOSTNAME concluído"
EOSSH

echo "📋 Próximo passo: copie discord-bot/.env para o remoto:"
echo "  scp discord-bot/.env $TARGET:$REMOTE_DIR/discord-bot/.env"
echo "Depois: ./scripts/deploy.sh $TARGET"
