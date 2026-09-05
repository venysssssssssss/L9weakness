import { randomInt, randomUUID } from 'crypto';
import type { User } from 'discord.js';
import { Game, Decks } from '../utils/mtg';
import type { CardInstance } from '../utils/mtg';

export type DeckName = keyof typeof Decks;
export type DiceKind = 'd20' | 'd6' | 'coin';
// ponytail: sala vive só em memória; caiu o bot, caiu a sala. Persistir quando doer.
export const ROOM_TTL_MS = 4 * 60 * 60 * 1000;
const LOG_CAP = 100;

export interface Room {
    id: string;
    channelId: string;
    game: Game;
    hostId: string;
    guestId: string;
    keys: Map<string, string>; // chave pessoal do link -> playerId
    ready: boolean;
    log: string[];
    createdAt: number;
    lastActive: number;
}

export interface CardDTO {
    instanceId: string;
    name: string;
    mana_cost: string;
    type_line: string;
    oracle_text: string;
    power?: string;
    toughness?: string;
    image_uri: string;
    tapped: boolean;
    summoningSickness: boolean;
    counters: number;
}

export interface DiceEvent {
    by: string;
    kind: DiceKind;
    value: number | string;
}

const rooms = new Map<string, Room>();

const dto = (c: CardInstance): CardDTO => ({
    instanceId: c.instanceId,
    name: c.name,
    mana_cost: c.mana_cost,
    type_line: c.type_line,
    oracle_text: c.oracle_text,
    power: c.power,
    toughness: c.toughness,
    image_uri: c.image_uri,
    tapped: c.tapped,
    summoningSickness: c.summoningSickness,
    counters: c.counters,
});

export function pushLog(room: Room, line: string) {
    room.log.push(line);
    if (room.log.length > LOG_CAP) room.log.splice(0, room.log.length - LOG_CAP);
}

export function otherId(room: Room, playerId: string): string {
    return playerId === room.hostId ? room.guestId : room.hostId;
}

export function playerName(room: Room, playerId: string): string {
    const p = room.game.players[playerId];
    const u = (p?.user ?? {}) as Partial<User>;
    return u.username ?? (playerId === room.hostId ? 'Anfitrião' : 'Desafiante');
}

export function createRoom(channelId: string, host: User, guest: User): { room: Room; hostKey: string; guestKey: string } {
    const game = new Game(channelId, host);
    game.addPlayer(guest);
    const room: Room = {
        id: randomUUID(),
        channelId,
        game,
        hostId: host.id,
        guestId: guest.id,
        keys: new Map(),
        ready: false,
        log: [],
        createdAt: Date.now(),
        lastActive: Date.now(),
    };
    const hostKey = randomUUID();
    const guestKey = randomUUID();
    room.keys.set(hostKey, host.id);
    room.keys.set(guestKey, guest.id);
    rooms.set(room.id, room);
    pushLog(room, 'Sala criada — carregando decks…');
    return { room, hostKey, guestKey };
}

export function getRoom(id: string): Room | undefined {
    return rooms.get(id);
}

export function roomCount(): number {
    return rooms.size;
}

// Varre salas ociosas; retorna os ids removidos para o server fechar os sockets.
export function sweepRooms(now = Date.now()): string[] {
    const dead: string[] = [];
    for (const [id, room] of rooms) {
        if (now - room.lastActive > ROOM_TTL_MS) {
            rooms.delete(id);
            dead.push(id);
        }
    }
    return dead;
}

// Estado sob medida para cada jogador: mão do oponente nunca vaza (só a contagem).
export function snapshot(room: Room, viewerId: string) {
    const g = room.game;
    const oppId = otherId(room, viewerId);
    const me = g.players[viewerId];
    const opp = g.players[oppId];
    if (!me || !opp) return null;
    const pub = (pid: string) => {
        const p = g.players[pid];
        return {
            id: pid,
            name: playerName(room, pid),
            life: p.life,
            mana: { ...p.manaPool },
            battlefield: p.battlefield.map(dto),
            lands: p.lands.map(dto),
            graveyard: p.graveyard.map(dto),
            exile: p.exile.map(dto),
            libraryCount: p.library.length,
        };
    };
    return {
        room: room.id,
        ready: room.ready,
        turn: g.turn,
        phase: g.phase,
        active: g.activePlayerId,
        you: { ...pub(viewerId), hand: me.hand.map(dto), handCount: me.hand.length },
        opp: { ...pub(oppId), handCount: opp.hand.length },
        log: room.log.slice(-30),
    };
}

export type ActionResult = { ok: true; dice?: DiceEvent } | { ok: false; error: string };

const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
    const n = typeof v === 'number' ? Math.floor(v) : parseInt(String(v ?? ''), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
};

function findName(room: Room, playerId: string, instanceId: string): string {
    const p = room.game.players[playerId];
    if (!p) return 'carta';
    const c = [...p.hand, ...p.battlefield, ...p.lands].find((x) => x.instanceId === instanceId);
    return c?.name ?? 'carta';
}

export function rollDice(kind: DiceKind): number | string {
    if (kind === 'd20') return randomInt(1, 21);
    if (kind === 'd6') return randomInt(1, 7);
    return Math.random() < 0.5 ? 'Cara' : 'Coroa';
}

export function applyAction(room: Room, playerId: string, msg: any): ActionResult {
    const g = room.game;
    const me = g.players[playerId];
    if (!me) return { ok: false, error: 'jogador fora da sala' };
    room.lastActive = Date.now();

    const t = msg?.t;
    if (typeof t !== 'string') return { ok: false, error: 'ação inválida' };
    if (['play', 'tap', 'destroy', 'draw', 'phase'].includes(t) && !room.ready) {
        return { ok: false, error: 'deck ainda carregando…' };
    }

    switch (t) {
        case 'play': {
            if (typeof msg.card !== 'string') return { ok: false, error: 'carta inválida' };
            const c = g.playCard(playerId, msg.card);
            if (!c) return { ok: false, error: 'carta inválida' };
            pushLog(room, `${playerName(room, playerId)} jogou ${c.name}`);
            return { ok: true };
        }
        case 'tap': {
            if (typeof msg.card !== 'string') return { ok: false, error: 'carta inválida' };
            const name = findName(room, playerId, msg.card);
            if (!g.tapCard(playerId, msg.card)) return { ok: false, error: 'carta inválida' };
            pushLog(room, `${playerName(room, playerId)} virou ${name}`);
            return { ok: true };
        }
        case 'destroy': {
            if (typeof msg.card !== 'string') return { ok: false, error: 'carta inválida' };
            const name = findName(room, playerId, msg.card);
            if (!g.destroyCard(playerId, msg.card)) return { ok: false, error: 'carta inválida' };
            pushLog(room, `${playerName(room, playerId)} destruiu ${name}`);
            return { ok: true };
        }
        case 'draw': {
            const n = clampInt(msg.n ?? 1, 1, 7, 1);
            if (!g.draw(playerId, n)) return { ok: false, error: 'grimório vazio' };
            pushLog(room, `${playerName(room, playerId)} comprou ${n}`);
            return { ok: true };
        }
        case 'untap': {
            g.untapAll(playerId);
            pushLog(room, `${playerName(room, playerId)} desvirou tudo`);
            return { ok: true };
        }
        case 'phase': {
            if (g.activePlayerId !== playerId) return { ok: false, error: 'só o jogador ativo passa de fase' };
            if (g.phase === 'end') g.activePlayerId = otherId(room, playerId); // novo ativo compra/desvira
            g.nextPhase();
            pushLog(room, `Fase: ${g.phase} (turno ${g.turn}, ativo: ${playerName(room, g.activePlayerId)})`);
            return { ok: true };
        }
        case 'life': {
            if (msg.set !== undefined) {
                const v = Number(msg.set);
                if (!Number.isInteger(v) || v < 0 || v > 99) return { ok: false, error: 'valor inválido' };
                me.life = v;
            } else if (msg.delta !== undefined) {
                const d = Number(msg.delta);
                if (!Number.isInteger(d) || d === 0 || Math.abs(d) > 20) return { ok: false, error: 'valor inválido' };
                me.life = Math.min(999, Math.max(-99, me.life + d));
            } else return { ok: false, error: 'valor inválido' };
            pushLog(room, `Vida de ${playerName(room, playerId)}: ${me.life}`);
            return { ok: true };
        }
        case 'dice': {
            if (msg.kind !== 'd20' && msg.kind !== 'd6' && msg.kind !== 'coin') return { ok: false, error: 'dado inválido' };
            const value = rollDice(msg.kind);
            const dice = { by: playerName(room, playerId), kind: msg.kind as DiceKind, value };
            pushLog(room, `🎲 ${dice.by} rolou ${msg.kind}: ${value}`);
            return { ok: true, dice };
        }
        default:
            return { ok: false, error: 'ação desconhecida' };
    }
}
