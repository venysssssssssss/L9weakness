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

## Learning contínuo

- **Agendado:** `LEARNING_CRON=0 */4 * * *` UTC × `LEARNING_DURATION_MIN=10` (6 slots = 60 min/dia) via `node-cron` em `utils/learning/scheduler.ts`. `LEARNING_MAX_PAGES_DAY=250` corta cedo.
- **Fila do chat:** buscas que o SimSimi fez (`action:search`) e `/learning curiosidade tema` entram em `curiosity_queue` e são pesquisadas primeiro.
- **Manual:** `/learning trigger minutos:60` (admin) dá 1 h sob demanda; `./scripts/learning-test.sh 2` local.
- **Status:** `/learning status` / `/learning will` / `/learning history`
- **DB:** `discord-bot/data/learning.db` (SQLite: knowledge + FTS5, chat_messages, memory_notes, curiosity_queue) + `data/will.json`
- **Chat usa a base:** `messageCreate.js` injeta `knowledge` (FTS5 top 3) e `notes` no prompt; modelo pode pedir `search` (DDG + fetch) 1× por turno.

## Modelos NVIDIA (fallback)

- `NVIDIA_CHAT_MODELS` (chat) e `NVIDIA_FAST_MODELS` (resumos) são listas csv; `chat()` cai para o próximo em 429/5xx/timeout/404/vazio.
- Medir de novo: `scripts/probe-models.sh [modelo ...]` (roda em kali1, usa a chave do `.env`). Vários ids do catálogo dão 404 para a conta.
- Checar prompt ao vivo: `npm run build && node dist/test-simsimi-live.js`.

## Datas comemorativas (22h) e imagens

- Todo dia `DAILY_DATES_CRON=0 22 * * *` no fuso `DAILY_DATES_TZ=America/Sao_Paulo` o bot posta em `#general`
  (`DAILY_DATES_CHANNEL`, ou `DAILY_DATES_CHANNEL_ID`) todas as datas do dia: calendarr.com (ano inteiro, 1 fetch/dia)
  + Wikipédia PT ("D de mês" → Feriados e eventos cíclicos). `/hoje` mostra a mesma lista na hora.
- `/imaginar` usa `NVIDIA_IMAGE_MODEL` (csv, fallback) em `https://ai.api.nvidia.com/v1/genai/<model>`: `flux.2-klein-4b`
  (2.5–3 s, melhor aderência, escreve texto) → `flux.1-dev` (5–7 s). Listar tudo que a conta enxerga:
  `curl -H "Authorization: Bearer $KEY" https://api.nvcf.nvidia.com/v2/nvcf/functions`. sdxl*/sd3*/bria dão 404; schnell/cosmos3 respondem 202 (async, não suportado).

## Build

- Prod roda **compilado**: `npm run build` (tsc + `arena/public`) → `node dist/index.js`. `Dockerfile` é multi-stage (imagem ~500 MB, sem ts-node).
- Dev continua `npm start` (ts-node). Testes: `npm test`.

## Backup + standby (kali2)

- kali1 cron 04:30 UTC: `scripts/backup-data.sh` → `learning.bak.db` (SQLite online backup), `will.json`, `mtg.db` para `kali2:~/L9weakness/discord-bot/data/`.
- kali2 tem o repo clonado, `.env` copiado e imagem buildada, **container parado**.
- **Promover kali2** (kali1 fora): `ssh kali2 'cd L9weakness && cp discord-bot/data/learning.bak.db discord-bot/data/learning.db && docker compose -f docker-compose.prod.yml up -d'`. Nunca rode os dois ao mesmo tempo (mesmo token).
- **Voltar p/ kali1:** parar em kali2, copiar `data/` de volta, `up -d` em kali1.

## Variáveis .env relevantes

```env
NVIDIA_API_KEY=nvapi-...
NVIDIA_CHAT_MODELS=nvidia/nemotron-3-ultra-550b-a55b,nvidia/nemotron-3-super-120b-a12b,z-ai/glm-5.3,openai/gpt-oss-20b
NVIDIA_FAST_MODELS=nvidia/nemotron-3-super-120b-a12b,mistralai/mistral-nemotron,nvidia/nemotron-3.5-lightning-30b-a3b,openai/gpt-oss-20b
NVIDIA_VISION_MODEL=meta/llama-3.2-90b-vision-instruct
NVIDIA_IMAGE_MODEL=black-forest-labs/flux.2-klein-4b,black-forest-labs/flux.1-dev
DAILY_DATES_CRON=0 22 * * *
LEARNING_ENABLED=true
LEARNING_CRON=0 */4 * * *
LEARNING_DURATION_MIN=10
LEARNING_MAX_PAGES_DAY=250
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
