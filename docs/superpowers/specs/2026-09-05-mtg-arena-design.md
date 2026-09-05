# MTG Arena — Design (A: Bot vira Web)

Data: 2026-09-05 | Status: aprovado pelo usuário | v1 escopo A

## 1. Objetivo
Arena de MTG plenamente jogável 1v1 via Discord: `!arena @oponente` cria sala, bot envia link na DM + canal, os dois jogam em mesa web com clima Hearthstone in-game, essência MTG e melhor do tabletop v1 = dados + hover-expand.

## 2. Travas do usuário
- Regras: essência MTG (vida 20, grimório/mão/campo/cemitério/exílio, fases, virar p/ mana/ataque), sem enforcement total de pilha no v1.
- Clima: Hearthstone in-game (fileiras, mão em leque, HUD vida/mana, botão passar fase).
- Tabletop v1 = A: d20/d6/moeda sincronizados + hover expande sua carta e a do oponente p/ ler.
- Desafio direto (sem fila pareada no v1).
- Decks: A agora (2 pré-montados via `Decks` + Scryfall) + C depois (importar lista dentro da arena sem quebrar sala).
- Hospedagem: mais preguiçosa que funcione = mesmo processo do bot.

## 3. Arquitetura
Mesmo processo do bot serve `GET /arena/:roomId` (HTML estático) + `WS /arena/:roomId`. Sala = `Map<roomId, Game>` em memória, reusa `discord-bot/utils/mtg/Game.ts`, `Card.ts`, `ScryfallService`, `Decks`. `!arena` cria `Game`, `loadDeck(Red Aggro)` p/ ambos, gera `uuid` inadvinhável, manda embed com link. Sem React, sem host novo, sem build. Só adiciona `ws` se ainda não existir.

## 4. Componentes
- `discord-bot/arena/server.ts`: http + ws, `Map` salas, TTL 4h idle, broadcast de `state` cheio on-change.
- `discord-bot/arena/public/arena.html`: mesa + CSS (feltro, fileiras, HUD, painel leitura, botões dado).
- `discord-bot/arena/public/arena.js`: render via `img image_uri large`, hover scale + painel, ações WS, log.
- Comando `!arena`: cria sala + envia links.

## 5. Protocolo / Fluxo
JSON mínimo, servidor autoridade: `join{roomId,discordId}` → `state{you,opp,turn,phase,log}` → `play|tap|draw|life|dice|phase` validados via `Game.playCard/tapCard/draw/untapAll/nextPhase` → broadcast `state`. Primeiras 2 conexões viram players, 3ª rejeitada. Vínculo por `hostId/guestId` do comando: só esses `discordId` assumem slots (host=P1, guest=P2); qualquer outro `discordId` é rejeitado no v1 (sem espectador). Reconnect com mesmo link ressincroniza. Dado rolado no server (`crypto.randomInt`) e logado p/ ambos.

## 6. Visual / Interação
Oponente em cima (mão = versos + contagem, campo aberto), seu campo/lands no meio, sua mão em leque embaixo. Carta = Scryfall `large` lazy. Hover campo (seu + oponente) = `scale(1.9)` + painel fixo lateral com imagem grande + oráculo/P-T; mobile = tap abre painel. Mão oponente nunca expande (info oculta). Dados: d20/d6/moeda, animação CSS 600ms + log. Sem Canvas, sem drag livre no v1.

## 7. Erros / Limites
Ação inválida = ignora + toast. Scryfall falha = verso placeholder. WS caiu = banner + re-join auto. Sala idle 4h = expira. Terceiro jogador = rejeitado. Full-state broadcast evita dessync fino no v1.

## 8. Teste
1 check rodável sem framework: cria `Game`, loadDeck, joga land, vira, rola dado, valida ida-volta WS. + checklist manual 2 browsers: hover lê, dado sincroniza, reconnect ressincroniza.

## 9. Skipped (YAGNI)
React/build, host separado, fila pareada, drag livre, juiz livre, persistência, espectador, importação de lista (fase 2, sem quebrar sala). Add quando pedido real + medido.
