// ponytail: o único check da arena — lógica + HTTP + WS de verdade. Roda: node -r ts-node/register arena/selfcheck.ts
import assert from 'assert';
import http from 'http';
import { WebSocket } from 'ws';
import { Card } from '../utils/mtg';
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
const card = (name: string, owner: string, land = false) =>
    new Card({ id: name, name, mana_cost: '', type_line: land ? 'Basic Land' : 'Creature', oracle_text: 'x', image_uri: '' }, owner);

async function main() {
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

    assert.equal((applyAction(room, 'u1', { t: 'life', set: 999 }) as any).ok, false, 'set absurdo rejeitado');
    (applyAction(room, 'u1', { t: 'life', set: 17 }) as any).ok;
    assert.equal(room.game.players.u1.life, 17, 'set válido aplica');
    assert.equal((applyAction(room, 'u1', { t: 'life', delta: 50 }) as any).ok, false, 'delta absurdo rejeitado');
    console.log('PASS unit vida clamp');

    // --- E2E http + ws ---
    ensureArenaServer();
    await sleep(400);
    const html = await get(`/arena/${room.id}`);
    assert.equal(html.status, 200, 'mesa html 200');
    assert.ok(html.body.includes('ARENA MTG'), 'html é a arena');
    const noRoom = await get('/arena/sala-que-nao-existe');
    assert.equal(noRoom.status, 404, 'sala inexistente 404');
    const badKey = await get(`/arena/${room.id}/state?key=lixo`);
    assert.equal(badKey.status, 401, 'chave inválida 401');
    const goodState = await get(`/arena/${room.id}/state?key=${hostKey}`);
    assert.equal(goodState.status, 200, 'state polling 200');
    console.log('PASS e2e http');

    const msgs: any[] = [];
    const ws = new WebSocket(`ws://127.0.0.1:${arenaPort()}/arena/${room.id}?key=${hostKey}`);
    ws.on('message', (d) => msgs.push(JSON.parse(String(d))));
    const waitFor = async (pred: (x: any) => boolean, what: string) => {
        for (let i = 0; i < 50; i++) {
            const hit = msgs.find(pred);
            if (hit) return hit;
            await sleep(100);
        }
        throw new Error('timeout esperando ' + what);
    };
    await waitFor((x) => x.t === 'state', 'state inicial');
    const instId = room.game.players.u1.hand[0].instanceId;
    ws.send(JSON.stringify({ t: 'play', card: instId }));
    const after = await waitFor((x) => x.t === 'state' && x.you.lands.length === 1, 'land em jogo');
    assert.equal(after.you.hand.length, 0, 'mão esvaziou');
    ws.send(JSON.stringify({ t: 'dice', kind: 'd20' }));
    const dice = await waitFor((x) => x.t === 'dice', 'broadcast do dado');
    assert.ok(dice.value >= 1 && dice.value <= 20, 'dado sincronizado');
    ws.send(JSON.stringify({ t: 'life', delta: -3 }));
    await waitFor((x) => x.t === 'state' && x.you.life === 14, 'vida sincronizada');
    ws.send(JSON.stringify({ t: 'play', card: 'inexistente' }));
    await waitFor((x) => x.t === 'error', 'erro de ação inválida');
    ws.close();
    console.log('PASS e2e ws (join, play, dice, life, error)');

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
