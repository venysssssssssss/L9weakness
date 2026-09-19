#!/usr/bin/env bash
# Backup consistente de data/ (learning.db via SQLite online backup, will.json, mtg.db) → kali2.
# Cron em kali1 (04:30 UTC): 30 4 * * * /home/ubuntu/L9weakness/scripts/backup-data.sh >> /home/ubuntu/L9weakness/discord-bot/logs/backup.log 2>&1
set -eu
DIR="$(cd "$(dirname "$0")/.." && pwd)/discord-bot/data"
DEST="${BACKUP_DEST:-ubuntu@136.248.111.194:/home/ubuntu/L9weakness/discord-bot/data/}"
echo "[$(date -u +%FT%TZ)] backup start"
docker exec L9Weakness node -e "require('better-sqlite3')('data/learning.db').backup('data/learning.bak.db').then(()=>console.log('sqlite backup ok'))"
ssh -o BatchMode=yes "${DEST%%:*}" "mkdir -p ${DEST#*:}"
rsync -az "$DIR/learning.bak.db" "$DIR/will.json" "$DIR/mtg.db" "$DEST"
echo "[$(date -u +%FT%TZ)] backup ok → $DEST"
