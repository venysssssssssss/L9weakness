# SimSimi conversa profunda + treino contínuo + otimização kali1/kali2 — design

## Context

Bot de produção = **L9Weakness** (Discord, Node 20, discord.js 14) rodando em **kali1**
(`137.131.213.236`, OCI x86_64, 2 vCPU, 952 MB, Ubuntu 20.04, swap 2 GB) como container
`L9Weakness` (`docker-compose.prod.yml`, `ts-node index.ts` direto em prod, 285 MB RSS, ~4% CPU).
**kali2** (`136.248.111.194`, mesma spec) só tem `nginx-lb` (config default, sem proxy) +
`cloudflared`; ociosa. kali1→kali2 SSH já funciona (`~/sync_db.sh` faz rsync p/ ML_Joao).

Repo: `~/BIG/disc-bot/L9weakness` (local) = `origin/main` = `aaca348`. Prod está em `d9f11cf`
(4 commits atrás; arquivos "dirty" em prod são idênticos ao commit `f036ce0`, deploy seguro).
Prod roda o **messageCreate.js antigo** (responde tudo, cooldown 4s); a versão "gate por
contexto" (`62d2970`) nunca foi deployada.

Problemas encontrados:
- Chat **nunca lê** `learning.db` (1404 páginas, 14 dias). Prompt diz "não invente acesso à internet".
- Modelo único `openai/gpt-oss-20b`, sem fallback. Chave tem acesso a 82 modelos NVIDIA Build
  (kimi-k3, nemotron-3-super-120b-a12b, glm-5.3, deepseek-v4-flash, nemotron-3.5-lightning-30b…).
- Learning: 9% queries lixo (`curiosidade 4821`, "The", "We" — vazamento de raciocínio do gpt-oss),
  91× `Summarizer Failed: This operation was aborted` em 72 h (timeout 30 s), `will.json` degenerado
  ("Um dia mais sábio e curioso." ×5 concatenado, identity 800 chars).
- `utils/ai/{config,nvidiaClient,prompts,rateLimiter}.js` duplicam os `.ts`; Node resolve `.js`
  primeiro → os `.ts` são código morto em prod. `index.js`/`deploy-commands.js` legados idem.
- Sessão SimSimi só em memória: restart desliga o modo em todos os canais e perde histórico.
- kali1: 7 imagens docker órfãs × 1.5 GB; `learning.db` sem backup; RAM apertada (322 MB livre, swap em uso).
- DDG HTML search funciona: 440/444 ok em 7 dias → não precisa SearXNG/MCP externo.

Decisões do usuário: busca web = tool in-process (reusa `SearchProvider`+`Fetcher`);
kali2 = backup + standby manual; treino = base de conhecimento contínua (sem fine-tune);
build = `tsc` + Docker multi-stage.

## Design (aprovado em conversa; copiar p/ `docs/superpowers/specs/2026-09-19-simsimi-deep-chat-design.md` no passo 0)

### 1. Motor de conversa (`events/messageCreate.js`, mantém JS p/ preservar `simsimi.test.js`)
Mantém gate atual (direct/noise/cooldown/pause/drain). Muda:
- **Autonomia**: remove filtro `!direct && meaningful.length < 30` → "oi" solto chega ao modelo
  (throttle de 60 s `lastAttempt` p/ não-direct continua). Prompt recebe `will.identity` +
  `will.curiosity` → modelo entra sem ser chamado só se tema ∈ curiosidade/conhecimento (`reason:"interest"`).
- **Conhecimento**: antes da chamada, `storage.searchKnowledge(texto, 3)` (SQLite FTS5) → campo
  `knowledge:[{title,summary,url}]` no JSON do usuário. Notas de memória do canal/autor → `notes:[...]`.
- **Busca web (tool loop, 1 rodada)**: modelo pode devolver `{"action":"search","query":"..."}`.
  Handler roda `UnifiedSearchProvider.searchForTopic(q)` (top 3) + `PageFetcher.fetch` nos 2
  primeiros (3000 chars cada) → 2ª chamada com `search_results` → obrigatoriamente reply/silence.
  Orçamento total do turno ≤ 60 s; `search` ≤ 1 por turno; `valid()` re-checado entre chamadas.
- **Memória**: reply pode trazer `"note":"fato curto"` → `memory_notes` (cap 20/canal, 300 chars).
  Histórico e canais ativos persistidos (`chat_messages`, `chat_channels`) → sobrevive restart;
  contexto ao modelo = últimas 12 msgs ≤ 24 h (era 10 min).
- **Chat alimenta treino**: query de `search` (e `/learning curiosidade`) → `curiosity_queue` (cap 10)
  consumida no próximo slot de learning. (Perguntas `deep` não entram: conteúdo bruto é query ruim.)
- `decision()` aceita `search`; `text` via `extractJson()` (strip ```json e `<think>`).

### 2. Prompt (`utils/ai/prompts.ts`)
`buildSimsimiSystem(will)` substitui `SIMSIMI_SYSTEM` constante. Regras: PT-BR, sem fingir humano;
responde perguntas diretas (inclui "oi" solto); sem endereçamento só entra com contribuição concreta
em tema que lhe interessa; usa `knowledge`/`notes` como memória real; pede `search` p/ fato
específico, evento recente, URL ou quando não sabe — nunca inventa; após `search_results` não pode
pedir outra busca; `deep` = estruturado, ≤ 1900 chars; `note` só p/ fato durável sobre pessoa/canal.

### 3. Modelos NVIDIA (`utils/ai/config.ts`, `utils/ai/nvidiaClient.ts`)
- `NVIDIA_CHAT_MODELS` (lista csv, qualidade→fallback) e `NVIDIA_FAST_MODELS` (learning/resumo).
  Fallback p/ `NVIDIA_TEXT_MODEL` se ausentes.
- `chat({models, timeoutMs})` itera a cadeia em 429/5xx/timeout/vazio/`finish_reason:length`;
  loga `[NVIDIA] fallback a→b motivo`. `max_tokens` chat 3000 (modelos com raciocínio).
- `extractJson(raw)` exportado (usado por messageCreate, Summarizer).
- Cadeia default definida por `scripts/probe-models.sh` (passo 1): 6 candidatos × prompt JSON
  PT-BR; critério = JSON válido em 3/3 e p50 ≤ 8 s (chat) / ≤ 5 s (fast); ordena maior modelo primeiro.
  Candidatos chat: `moonshotai/kimi-k3`, `nvidia/nemotron-3-super-120b-a12b`, `z-ai/glm-5.3`,
  `deepseek-ai/deepseek-v4-flash-0731`, `mistralai/mistral-large-2-instruct`, `openai/gpt-oss-20b`.
  Fast: `z-ai/glm-5.3-flash`, `nvidia/nemotron-3.5-lightning-30b-a3b`, `nvidia/nemotron-nano-3-30b-a3b`, `openai/gpt-oss-20b`.
- `/models` e `/statusia` mostram a cadeia.

### 4. Treino contínuo (`utils/learning/*`)
- `scheduler.ts`: `LEARNING_CRON` (default `0 */4 * * *`) × `LEARNING_DURATION_MIN` (default 10)
  = 60 min/dia fatiados. `/learning trigger 60` continua dando 1 h sob demanda.
- `Orchestrator.ts`: consome `curiosity_queue` antes da curiosidade LLM; sem `curiosidade NNNN`
  (duplicata → pool diverso do Summarizer); `LEARNING_MAX_PAGES_DAY` (default 250) corta cedo;
  reflexão por slot mas `evolve()` só incrementa streak 1×/dia (`daily_reflections.day` existe → update).
- `Summarizer.ts`: usa `fastModels`, `timeoutMs 60000`, input 3500 chars; `generateCuriosityQuery`
  pede `{"query":"..."}` e usa `extractJson` (mata "The"/"We"); `will_update` **substitui** a cauda
  da identity (base fixa 300 chars + última evolução), `personality_evolution` = últimas 5 entradas.
- `Storage.ts`: FTS5 `knowledge_fts(title,summary,topic, content=knowledge)` + triggers +
  `rebuild` na criação; tabelas `chat_channels`, `chat_messages`, `memory_notes`, `curiosity_queue`;
  métodos `searchKnowledge`, `activeChannels/setActive`, `saveMessage/recentMessages`,
  `saveNote/getNotes`, `pushCuriosity/popCuriosity`. Construtor aceita path (`:memory:` p/ teste).
- `commands/utility/learning.ts`: status mostra cron/fila; subcomando `curiosidade <tema>` empurra na fila.

### 5. Build/runtime
- Apagar twins: `index.js`, `deploy-commands.js`, `test-models.js`, `utils/ai/*.js`,
  `events/interactionCreate.js`, `commands/fun/mtg.js` (stubs "// Migrated").
- `tsconfig.json`: `allowJs`, `outDir dist`, exclude `dist`, `node_modules`, `arena/public`.
  `package.json`: `typescript`, `ts-node`, `@types/*` → devDependencies; `build: tsc && cp -r
  arena/public dist/arena/ && cp *.png dist/`; `test: npm run build && node --test dist/*.test.js`;
  `start` (dev) continua `ts-node index.ts`.
- `Dockerfile` multi-stage: build (deps de compilação, `npm ci`, `npm run build`, `npm prune
  --omit=dev`) → runtime slim (`libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libjpeg62-turbo libgif7
  librsvg2-2 libopus0 ffmpeg`), `COPY --from=build /app/node_modules`, `COPY --from=build /app/dist ./`.
  Layout em `/app` igual ao atual → `__dirname/../../data` continua válido.
  `CMD ["node","--max-old-space-size=384","index.js"]`.
- `docker-compose.prod.yml`: `mem_limit: 640m` (container morre antes do host thrash).

### 6. Ops kali1/kali2
- kali1 `.env` (append, sem ler segredos): `NVIDIA_CHAT_MODELS`, `NVIDIA_FAST_MODELS`,
  `LEARNING_CRON=0 */4 * * *`, `LEARNING_DURATION_MIN=10`, `LEARNING_MAX_PAGES_DAY=250`.
- kali1: `docker image prune -f` (~10 GB); cron 04:30 UTC `scripts/backup-data.sh`:
  `docker exec L9Weakness node -e "require('better-sqlite3')('data/learning.db').backup('data/learning.bak.db')"`
  + `rsync -az data/{learning.bak.db,will.json,mtg.db} ubuntu@136.248.111.194:~/L9weakness/discord-bot/data/`
  (mesmo padrão de `~/sync_db.sh`).
- kali2 standby: `git clone`, `scp .env`, `docker compose -f docker-compose.prod.yml build`
  (imagem pronta, **não** `up`). Promover = parar kali1 + `up -d` em kali2 (documentar em DEPLOY.md).
  Remover `nginx-lb` (config default, sem função) — confirmar com usuário antes.
- `scripts/deploy.sh kali1` já faz `git reset --hard origin/main` + docker build; `.env`/`data`
  são ignorados → seguros.
- Flag (não fazer agora): Ubuntu 20.04 EOL nas duas VMs; upgrade exige sudo + reboot.


## Resultado do probe (2026-09-19, `scripts/probe-models.sh`, JSON PT-BR, 3 prompts)

| modelo | ok | p50 | max |
|---|---|---|---|
| nvidia/nemotron-3-ultra-550b-a55b | 3/3 | 1.6 s | 2.8 s |
| mistralai/mistral-nemotron | 3/3 | 1.2 s | 1.9 s |
| nvidia/nemotron-3-super-120b-a12b | 3/3 | 3.0 s | 7.2 s |
| z-ai/glm-5.3 | 3/3 | 21 s | 22 s |
| nvidia/nemotron-3.5-lightning-30b-a3b | 3/3 | 23 s | 31 s |
| openai/gpt-oss-20b | 3/3 | 17–18 s | 19 s |
| moonshotai/kimi-k3, deepseek-v4-flash, glm-5.3-flash | timeout 60 s | | |
| mistral-large-2, nemotron-nano-3, llama-3.1-nemotron-70b/ultra-253b, kimi-k2.6, gemma-3-12b | 404 p/ conta | | |

Cadeias: CHAT = ultra-550b → super-120b → glm-5.3 → gpt-oss-20b; FAST = super-120b → mistral-nemotron → lightning-30b → gpt-oss-20b (mistral-nemotron abortou em 60 s com input de 3,5k chars no slot de teste em prod; super-120b primeiro).
Prompt validado ao vivo (`dist/test-simsimi-live.js`): oi solto → reply; fato recente → search; conversa de terceiros → silence; knowledge → "eu li que…" + note; pedido deep → estruturado.
