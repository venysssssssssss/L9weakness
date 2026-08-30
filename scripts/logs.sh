#!/usr/bin/env bash
# Logs rápidos
# Uso: ./scripts/logs.sh [local|kali1|kali2] [--lines 50] [--follow]

TARGET="${1:-local}"
if [[ "$1" == --* ]]; then TARGET="local"; fi

case "$TARGET" in
  local)
    pm2 logs L9Weakness --lines 50 --nostream 2>&1 | tail -n 100
    echo "--- PM2 list ---"
    pm2 list
    echo "--- Learning DB ---"
    ls -lh discord-bot/data/learning.db discord-bot/data/will.json 2>&1 | head -n 10
    sqlite3 discord-bot/data/learning.db "SELECT day, count(*) as c FROM knowledge GROUP BY day ORDER BY day DESC LIMIT 7;" 2>&1 | head -n 20 || echo "sqlite3 não instalado, use: sudo apt install sqlite3"
    ;;
  kali1|kali2)
    echo "📡 Logs remoto $TARGET..."
    ssh "$TARGET" "pm2 logs L9Weakness --lines 50 --nostream 2>&1 | tail -n 80; echo '--- PM2 ---'; pm2 list 2>&1 | head -n 20; echo '--- Learning ---'; ls -lh /home/ubuntu/L9weakness/discord-bot/data/ 2>&1 | head -n 20" 2>&1 | tail -n 100
    ;;
  *)
    echo "Uso: $0 [local|kali1|kali2]"
    ;;
esac
