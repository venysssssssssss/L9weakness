#!/usr/bin/env bash
set -e

# L9 Weakness - Deploy completo para prod (kali1)
# Uso: ./scripts/deploy.sh [local|kali1|kali2|docker]  (default: local)
#  - local  : deploy no host atual (kali1 local 15GB, pm2)
#  - kali1  : deploy via SSH no VPS 137.131.213.236 (kaliv2v6) via git pull + docker
#  - kali2  : deploy via SSH no VPS 136.248.111.194 via git pull + docker
#  - docker : rebuild local docker-compose.prod.yml

TARGET="${1:-local}"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DISCORD_DIR="$REPO_DIR/discord-bot"

echo "🚀 Deploy L9 Weakness → target: $TARGET"
echo "📁 Repo: $REPO_DIR"

# 1. Valida .env
if [ ! -f "$DISCORD_DIR/.env" ]; then
  echo "❌ discord-bot/.env não encontrado! Copie de .env.example"
  exit 1
fi

# 2. Git: commit pendente?
if [ -n "$(git -C "$REPO_DIR" status --porcelain)" ]; then
  echo "⚠️  Há mudanças não commitadas. Fazendo stash temporário para deploy..."
  git -C "$REPO_DIR" stash push -m "deploy-$(date +%Y%m%d-%H%M%S)" --keep-index || true
fi

# 3. Push para origin (se houver remote)
if git -C "$REPO_DIR" remote | grep -q origin; then
  echo "📤 Push para origin..."
  git -C "$REPO_DIR" push origin main || echo "⚠️ push falhou (talvez sem permissão ou sem commits novos), seguindo..."
fi

deploy_local_pm2() {
  echo "🏠 Deploy LOCAL (PM2)..."
  cd "$DISCORD_DIR"
  echo "📦 npm install (com prebuild)..."
  # Usa npm ci se houver lock, senão npm install; não usa --omit=dev pois ts-node é necessário em prod (roda TS direto)
  if [ -f package-lock.json ]; then
    npm ci 2>&1 | tail -n 30 || npm install 2>&1 | tail -n 30
  else
    npm install 2>&1 | tail -n 30
  fi
  # Garante prebuild do canvas (evita erro MODULE_NOT_FOUND)
  npx prebuild-install -r napi --verbose 2>&1 | tail -n 10 || true
  echo "🤖 Deploy comandos Discord..."
  npm run deploy 2>&1 | tail -n 20 || node -r ts-node/register deploy-commands.ts 2>&1 | tail -n 20
  echo "🔄 PM2 restart..."
  # Usa ecosystem se existir, senão pm2 direto
  if [ -f "$REPO_DIR/ecosystem.config.js" ]; then
    pm2 startOrRestart "$REPO_DIR/ecosystem.config.js" --env production || pm2 restart L9Weakness --update-env
  else
    pm2 restart L9Weakness --update-env || pm2 start npm --name L9Weakness -- start
  fi
  pm2 save
  echo "✅ Local deploy OK"
  pm2 list
  pm2 logs L9Weakness --lines 20 --nostream | tail -n 30
}

deploy_docker_local() {
  echo "🐳 Deploy DOCKER local..."
  cd "$REPO_DIR"
  docker compose -f docker-compose.prod.yml build --pull
  docker compose -f docker-compose.prod.yml up -d
  docker compose -f docker-compose.prod.yml ps
  docker logs L9Weakness --tail 50 2>&1 | tail -n 30 || true
}

deploy_remote() {
  local SSH_ALIAS="$1"
  local REMOTE_DIR="/home/ubuntu/L9weakness"
  echo "🌐 Deploy REMOTO via SSH alias: $SSH_ALIAS → $REMOTE_DIR"
  echo "📡 Testando SSH..."
  ssh -o ConnectTimeout=10 "$SSH_ALIAS" "hostname; pwd" || { echo "❌ SSH falhou para $SSH_ALIAS"; exit 1; }

  echo "📂 Preparando diretório remoto..."
  ssh "$SSH_ALIAS" "mkdir -p $REMOTE_DIR && cd $REMOTE_DIR && if [ ! -d .git ]; then git clone https://github.com/venysssssssssss/L9weakness.git .; fi"

  echo "📥 Git pull remoto..."
  ssh "$SSH_ALIAS" "cd $REMOTE_DIR && git fetch origin && git reset --hard origin/main && git clean -fd"

  echo "🔧 Instalando deps remoto..."
  # Se tiver node no remoto, usa pm2, senão docker
  ssh "$SSH_ALIAS" "cd $REMOTE_DIR && if command -v node >/dev/null 2>&1; then cd discord-bot && npm ci 2>&1 | tail -n 20 && npx prebuild-install -r napi 2>&1 | tail -n 5 && npm run deploy 2>&1 | tail -n 20 || true; pm2 restart L9Weakness --update-env || pm2 start npm --name L9Weakness -- start; pm2 save; else echo 'Node não encontrado, usando Docker...'; docker compose -f docker-compose.prod.yml build --pull && docker compose -f docker-compose.prod.yml up -d; fi"

  echo "✅ Remoto $SSH_ALIAS deploy OK"
  ssh "$SSH_ALIAS" "pm2 list 2>&1 | head -n 20; docker ps 2>&1 | head -n 20" || true
}

case "$TARGET" in
  local)
    deploy_local_pm2
    ;;
  docker)
    deploy_docker_local
    ;;
  kali1)
    deploy_remote "kali1"
    ;;
  kali2)
    deploy_remote "kali2"
    ;;
  *)
    echo "Uso: $0 [local|kali1|kali2|docker]"
    exit 1
    ;;
esac

echo "🎉 Deploy $TARGET concluído!"
echo "💡 Dica: ./scripts/deploy.sh local   → rápido (PM2)"
echo "         ./scripts/deploy.sh kali1   → prod VPS via SSH"
echo "         ./scripts/logs.sh           → ver logs"
