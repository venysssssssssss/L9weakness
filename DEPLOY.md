# Deploy L9 Weakness — Prod 24/7

## Arquitetura

- **Dev/Local (kali1 15GB, 192.168.0.12):** PM2 `L9Weakness` roda `discord-bot/index.ts` via `ts-node`. Já está 24/7 com `ecosystem.config.js`.
- **Prod Remoto (kali1 VPS 137.131.213.236 / kali2 136.248.111.194):** VPS 952Mi, sem Node por padrão. Deploy via `docker-compose.prod.yml` (recomendado) ou `setup-remote.sh` + PM2.
- **Git:** `https://github.com/venysssssssssss/L9weakness` branch `main`. Deploy sempre faz `git pull --hard origin/main`.

## 24/7 — Garantir que nunca cai

No host onde roda (local kali1):

```bash
# Já está rodando? Verifique
pm2 list
pm2 logs L9Weakness --lines 50 --nostream

# Tornar 24/7 após reboot (systemd)
pm2 save
sudo env PATH=$PATH:/home/vanys/.nvm/versions/node/v24.12.0/bin \
  /home/vanys/.nvm/versions/node/v24.12.0/lib/node_modules/pm2/bin/pm2 startup systemd -u vanys --hp /home/vanys
# Cole o comando que o pm2 mostrar e depois:
pm2 save

# Verificar cron do aprendizado (1h/dia 03:00 UTC)
cat discord-bot/.env | grep LEARNING
pm2 logs L9Weakness | grep -i learning
```

## Deploy com 1 comando

### Local (rápido, PM2) — usado no dia a dia
```bash
./scripts/deploy.sh local
# ou
npm run deploy:local      # dentro de discord-bot
# ou
npm run deploy:kali1      # alias
```
Faz: `npm ci` → `npm run deploy` (slash commands) → `pm2 restart` → `pm2 save`

### Remoto kali1 (VPS)
```bash
# Primeira vez: preparar VPS (instala Node, PM2, Docker)
./scripts/setup-remote.sh kali1
scp discord-bot/.env kali1:/home/ubuntu/L9weakness/discord-bot/.env

# Deploy subsequentes (1 comando)
./scripts/deploy.sh kali1
./scripts/logs.sh kali1
```

### Docker (qualquer host)
```bash
./scripts/deploy.sh docker
docker compose -f docker-compose.prod.yml ps
docker logs L9Weakness --tail 100
```

## Learning 1h/dia

- **Agendado:** `LEARNING_START_HOUR=3` UTC por `LEARNING_DURATION_MIN=60` via `node-cron` em `utils/learning/scheduler.ts`
- **Manual:** `/learning trigger minutos:5` (admin no Discord) ou `./scripts/learning-test.sh 2`
- **Status:** `/learning status` / `/learning will` / `/learning history`
- **DB:** `discord-bot/data/learning.db` (SQLite) + `data/will.json`
- **Logs:** `pm2 logs | grep Learning`

## Variáveis .env relevantes

```env
NVIDIA_API_KEY=nvapi-...
NVIDIA_TEXT_MODEL=openai/gpt-oss-20b
NVIDIA_VISION_MODEL=meta/llama-3.2-90b-vision-instruct
LEARNING_ENABLED=true
LEARNING_START_HOUR=3
LEARNING_DURATION_MIN=60
```

## Checklist deploy

- [ ] `git status` limpo, `git push origin main`
- [ ] `discord-bot/.env` com todas as chaves
- [ ] `./scripts/deploy.sh local` → `pm2 list` online
- [ ] `pm2 logs` sem erro
- [ ] Testar `/learning status` no Discord
- [ ] `npm run deploy` já incluído no deploy.sh (slash commands)

## Rollback

```bash
# Local
git log --oneline -5
git reset --hard HEAD~1 && ./scripts/deploy.sh local

# Remoto
ssh kali1 "cd /home/ubuntu/L9weakness && git reset --hard HEAD~1 && ./scripts/deploy.sh kali1"
pm2 save
```
