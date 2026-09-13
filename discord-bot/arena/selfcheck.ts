// ponytail: o único check da arena — lógica + HTTP + WS de verdade. Roda: node -r ts-node/register arena/selfcheck.ts
import assert from 'assert';
import http from 'http';
import { WebSocket } from 'ws';
import { Card, Decks } from '../utils/mtg';
import { applyAction, createRoom, rollDice, snapshot } from './rooms';
import { arenaPort, ensureArenaServer } from './server';

process.env.ARENA_PORT = '18743';
const fakeUser = (id: string, username: string) => ({ id, username } as any);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const get = (path: string) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
        http.get({ host: '127.0.0.1', port: arenaPort(), path }, (res) => {
            let b = '';
            res.on('data', (c) => (b += c));
            res.on('end', () => resolve({ status: res.statusCode ?? 0, body: b }));
        }).on('error', reject);
    });
const card = (name: string, owner: string, land = false, extra: Partial<ConstructorParameters<typeof Card>[0]> = {}) =>
    new Card({
        id: name,
        name,
        mana_cost: land ? '' : '{1}',
        type_line: land ? 'Basic Land — Forest' : 'Creature',
        oracle_text: 'x',
        image_uri: '',
        power: land ? undefined : '2',
        toughness: land ? undefined : '2',
        ...extra,
    }, owner);

async function main() {
    assert.equal(Decks['Red Aggro'].length, 40, 'deck inicial vermelho tem 40 cartas');
    assert.equal(Decks['Green Stompy'].length, 40, 'deck inicial verde tem 40 cartas');
    console.log('PASS unit decks iniciais');
    // --- lógica pura ---
    const { room, hostKey, guestKey } = createRoom('ch1', fakeUser('u1', 'Anfitriao'), fakeUser('u2', 'Desafiante'));
    assert.ok(room.id.length > 20 && hostKey !== guestKey, 'sala com uuid + chaves distintas');
    room.game.players.u1.hand.push(card('Mountain', 'u1', true));
    room.game.players.u2.hand.push(card('Grizzly Bears', 'u2'));
    const s1: any = snapshot(room, 'u1');
    assert.equal(s1.you.hand.length, 1, 'vejo minha mão');
    assert.equal(s1.opp.handCount, 1, 'mão do oponente é só contagem');
    assert.ok(!('hand' in s1.opp), 'mão do oponente NÃO vaza');
    assert.equal(s1.you.name, 'Anfitriao', 'nome do jogador no snapshot');
    console.log('PASS unit snapshot redaction');

    room.ready = true; // ações de jogo exigem decks carregados
    room.game.phase = 'main1';
    assert.equal((applyAction(room, 'u2', { t: 'phase' }) as any).ok, false, 'só ativo passa fase');
    room.game.phase = 'end';
    assert.equal((applyAction(room, 'u1', { t: 'phase' }) as any).ok, true, 'fase avança');
    assert.equal(room.game.activePlayerId, 'u2', 'turno alterna no wrap');
    assert.equal(room.game.phase, 'untap', 'wrap volta ao untap');
    console.log('PASS unit turno alterna 1v1');

    for (let i = 0; i < 50; i++) {
        const v = rollDice('d20') as number;
        assert.ok(v >= 1 && v <= 20, 'd20 no intervalo');
    }
    assert.ok(['Cara', 'Coroa'].includes(rollDice('coin') as string), 'moeda válida');
    console.log('PASS unit dados');

    assert.equal((applyAction(room, 'u1', { t: 'life', delta: -3 }) as any).ok, false, 'vida manual rejeitada');
    assert.equal(room.game.players.u1.life, 20, 'vida só muda por regra do jogo');
    console.log('PASS unit vida autoritativa');

    // --- vertical slice rules ---
    const rules = createRoom('rules', fakeUser('r1', 'Diretor'), fakeUser('r2', 'Bloqueador'));
    const rg = rules.room.game;
    const r1 = rg.players.r1;
    const r2 = rg.players.r2;
    r1.library = [
        card('Filler A', 'r1'), card('Filler B', 'r1'), card('Forest', 'r1', true),
        card('Opt', 'r1', false, { mana_cost: '{0}', type_line: 'Instant', oracle_text: 'Draw a card.' }),
        card('Forest 2', 'r1', true, { name: 'Forest', type_line: 'Basic Land — Forest' }),
        card('Grizzly Bears', 'r1', false, { mana_cost: '{G}', power: '3', toughness: '3' }),
        card('Filler C', 'r1'),
    ];
    r2.library = [card('Filler D', 'r2'), card('Filler E', 'r2'), card('Forest', 'r2', true), card('Filler F', 'r2'), card('Filler G', 'r2'), card('Filler H', 'r2'), card('Filler I', 'r2')];
    rg.startMatch();
    rules.room.ready = true;
    assert.equal(rg.phase, 'mulligan', 'match começa em mulligan');
    assert.equal((applyAction(rules.room, 'r1', { t: 'keep' }) as any).ok, true, 'host mantém mão');
    assert.equal((applyAction(rules.room, 'r2', { t: 'keep' }) as any).ok, true, 'guest mantém mão');
    assert.equal(rg.phase, 'main1', 'mulligan inicia primeira main');
    const land = r1.hand.find((c) => /land/i.test(c.type_line));
    const land2 = r1.hand.find((c) => /land/i.test(c.type_line) && c.instanceId !== land?.instanceId);
    const creature = r1.hand.find((c) => c.name === 'Grizzly Bears');
    const opt = r1.hand.find((c) => c.name === 'Opt');
    assert.ok(land && land2 && creature && opt, 'mão determinística contém cartas de fluxo');
    assert.equal((applyAction(rules.room, 'r1', { t: 'play', card: land!.instanceId }) as any).ok, true, 'joga primeiro terreno');
    assert.equal((applyAction(rules.room, 'r1', { t: 'play', card: land2!.instanceId }) as any).ok, false, 'segundo terreno rejeitado');
    assert.equal((applyAction(rules.room, 'r1', { t: 'tap', card: land!.instanceId }) as any).ok, true, 'vira terreno para mana');
    assert.equal((applyAction(rules.room, 'r1', { t: 'play', card: creature!.instanceId }) as any).ok, true, 'conjura criatura');
    assert.equal((applyAction(rules.room, 'r2', { t: 'pass' }) as any).ok, true, 'oponente deixa criatura resolver');
    assert.equal((applyAction(rules.room, 'r1', { t: 'pass' }) as any).ok, true, 'ativo deixa criatura resolver');
    assert.equal(r1.battlefield.some((c) => c.instanceId === creature!.instanceId), true, 'criatura entra campo');
    assert.equal((applyAction(rules.room, 'r1', { t: 'cast', card: opt!.instanceId }) as any).ok, true, 'instantânea entra stack');
    assert.equal(rg.stack.length, 1, 'stack contém magia');
    assert.equal(rg.priorityPlayerId, 'r2', 'priority passa ao oponente');
    assert.equal((applyAction(rules.room, 'r2', { t: 'pass' }) as any).ok, true, 'oponente passa');
    assert.equal((applyAction(rules.room, 'r1', { t: 'pass' }) as any).ok, true, 'ativo passa e resolve');
    assert.equal(rg.stack.length, 0, 'stack resolve LIFO');
    assert.ok(r1.graveyard.some((c) => c.name === 'Opt'), 'instantânea vai ao cemitério');
    rg.phase = 'main1'; rg.priorityPlayerId = 'r1'; rg.activePlayerId = 'r1';
    const blocker = card('Wall', 'r2', false, { type_line: 'Creature — Wall', power: '1', toughness: '1' });
    blocker.summoningSickness = false;
    r2.battlefield.push(blocker);
    creature!.summoningSickness = false;
    assert.equal((applyAction(rules.room, 'r1', { t: 'phase' }) as any).ok, true, 'entra combate');
    assert.equal((applyAction(rules.room, 'r1', { t: 'attackers', cards: [creature!.instanceId] }) as any).ok, true, 'declara atacante');
    assert.equal((applyAction(rules.room, 'r2', { t: 'blockers', assignments: { [creature!.instanceId]: blocker.instanceId } }) as any).ok, true, 'declara bloqueador');
    assert.equal(r2.battlefield.some((c) => c.instanceId === blocker.instanceId), false, 'dano letal remove bloqueador');
    assert.equal((applyAction(rules.room, 'r1', { t: 'concede' }) as any).ok, true, 'concede encerra partida');
    assert.equal(rg.winnerId, 'r2', 'concessão define vencedor');
    const before = JSON.stringify(snapshot(rules.room, 'r1'));
    assert.equal((applyAction(rules.room, 'r1', { t: 'play', card: 'inexistente' }) as any).ok, false, 'id inválido rejeitado');
    assert.equal(JSON.stringify(snapshot(rules.room, 'r1')), before, 'ação inválida não altera estado');
    console.log('PASS unit vertical slice (setup, mana, stack, combat, win, validation)');

    // --- E2E http + ws ---
    room.game.phase = 'main1';
    room.game.activePlayerId = 'u1';
    room.game.priorityPlayerId = 'u1';
    room.game.players.u1.landsPlayedThisTurn = 0;
    ensureArenaServer();
    await sleep(400);
    const html = await get(`/arena/${room.id}`);
    assert.equal(html.status, 200, 'mesa html 200');
    assert.ok(html.body.includes('ARENA MTG'), 'html é a arena');
    assert.ok(html.body.includes('98dcbd32'), 'contrato visual está no markup');
    assert.ok(html.body.includes('prefers-reduced-motion'), 'arena respeita movimento reduzido');
    assert.ok(html.body.includes('id="cueRail"') && html.body.includes('id="stack"'), 'mesa tem cue rail e stack');
    const js = await get(`/arena/${room.id}/assets/arena.js`);
    assert.equal(js.status, 200, 'cliente js 200');
    assert.ok(js.body.includes("if (!state) $('loading').style.display = 'none';"), 'falha inicial do ws libera overlay');
    const noRoom = await get('/arena/sala-que-nao-existe');
    assert.equal(noRoom.status, 404, 'sala inexistente 404');
    const badKey = await get(`/arena/${room.id}/state?key=lixo`);
    assert.equal(badKey.status, 401, 'chave inválida 401');
    const goodState = await get(`/arena/${room.id}/state?key=${hostKey}`);
    assert.equal(goodState.status, 200, 'state polling 200');
    console.log('PASS e2e http');

    const msgs: any[] = [];
    const guestMsgs: any[] = [];
    const ws = new WebSocket(`ws://127.0.0.1:${arenaPort()}/arena/${room.id}?key=${hostKey}`);
    const wsGuest = new WebSocket(`ws://127.0.0.1:${arenaPort()}/arena/${room.id}?key=${guestKey}`);
    ws.on('message', (d) => msgs.push(JSON.parse(String(d))));
    wsGuest.on('message', (d) => guestMsgs.push(JSON.parse(String(d))));
    const waitFor = async (pred: (x: any) => boolean, what: string) => {
        for (let i = 0; i < 50; i++) {
            const hit = msgs.find(pred);
            if (hit) return hit;
            await sleep(100);
        }
        throw new Error('timeout esperando ' + what);
    };
    await waitFor((x) => x.t === 'state', 'state inicial');
    const waitGuest = async (pred: (x: any) => boolean, what: string) => {
        for (let i = 0; i < 50; i++) {
            const hit = guestMsgs.find(pred);
            if (hit) return hit;
            await sleep(100);
        }
        throw new Error('timeout esperando guest ' + what);
    };
    const waitForNew = async (from: number, pred: (x: any) => boolean, what: string) => {
        for (let i = 0; i < 50; i++) {
            const hit = msgs.slice(from).find(pred);
            if (hit) return hit;
            await sleep(100);
        }
        throw new Error('timeout esperando ' + what);
    };
    await waitGuest((x) => x.t === 'state', 'state inicial');
    const instId = room.game.players.u1.hand[0].instanceId;
    ws.send(JSON.stringify({ t: 'play', card: instId }));
    const after = await waitFor((x) => x.t === 'state' && x.you.lands.length === 1, 'land em jogo');
    assert.equal(after.you.hand.length, 0, 'mão esvaziou');
    await waitGuest((x) => x.t === 'state' && x.opp.lands.length === 1, 'land espelhado');
    ws.send(JSON.stringify({ t: 'tap', card: instId }));
    await waitGuest((x) => x.t === 'event' && x.type === 'tap', 'evento espelhado');
    ws.send(JSON.stringify({ t: 'dice', kind: 'd20' }));
    const dice = await waitFor((x) => x.t === 'dice', 'broadcast do dado');
    assert.ok(dice.value >= 1 && dice.value <= 20, 'dado sincronizado');
    const beforeLife = msgs.length;
    ws.send(JSON.stringify({ t: 'life', delta: -3 }));
    await waitForNew(beforeLife, (x) => x.t === 'error' && x.error === 'ação desconhecida', 'vida manual rejeitada');
    const beforeInvalid = msgs.length;
    ws.send(JSON.stringify({ t: 'play', card: 'inexistente' }));
    await waitForNew(beforeInvalid, (x) => x.t === 'error', 'erro de ação inválida');
    const hostErrorsBeforeGuest = msgs.filter((x) => x.t === 'error').length;
    wsGuest.send(JSON.stringify({ t: 'play', card: 'inexistente' }));
    await waitGuest((x) => x.t === 'error', 'erro privado do guest');
    assert.equal(msgs.filter((x) => x.t === 'error').length, hostErrorsBeforeGuest, 'erro não vaza ao outro jogador');
    ws.close();
    wsGuest.close();
    console.log('PASS e2e ws (join, play, dice, validation, error)');

    const closed = await new Promise<boolean>((resolve) => {
        const bad = new WebSocket(`ws://127.0.0.1:${arenaPort()}/arena/${room.id}?key=lixo`);
        bad.on('close', () => resolve(true));
        bad.on('error', () => resolve(true));
        setTimeout(() => resolve(false), 3000);
    });
    assert.ok(closed, 'ws com chave ruim é derrubado');
    console.log('PASS e2e auth ws');

    console.log('ARENA SELFCHECK OK');
    process.exit(0);
}

main().catch((e) => {
    console.error('ARENA SELFCHECK FAIL:', e);
    process.exit(1);
});
