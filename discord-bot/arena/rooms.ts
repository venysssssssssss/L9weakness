import { randomInt, randomUUID } from 'crypto';
import type { User } from 'discord.js';
import { Game, Decks, GameEvent } from '../utils/mtg';
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
    power: c.power ? String(Number(c.power) + (c.powerBonus ?? 0)) : c.power,
    toughness: c.toughness ? String(Number(c.toughness) + (c.toughnessBonus ?? 0)) : c.toughness,
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
        priority: g.priorityPlayerId,
        winner: g.winnerId,
        stack: g.stack.map((item) => ({ id: item.id, card: dto(item.card), controllerId: item.controllerId, effect: item.effect, targetId: item.targetId })),
        combat: g.combat,
        you: { ...pub(viewerId), hand: me.hand.map(dto), handCount: me.hand.length, kept: me.kept, mulliganCount: me.mulliganCount },
        opp: { ...pub(oppId), handCount: opp.hand.length },
        log: room.log.slice(-30),
    };
}

export type ActionResult = { ok: true; dice?: DiceEvent; events?: GameEvent[] } | { ok: false; error: string };

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
    if (!['life', 'dice'].includes(t) && !room.ready) {
        return { ok: false, error: 'deck ainda carregando…' };
    }
    if (g.phase === 'game-over' && !['dice'].includes(t)) return { ok: false, error: 'partida encerrada' };

    switch (t) {
        case 'play': {
            if (typeof msg.card !== 'string') return { ok: false, error: 'carta inválida' };
            if (g.priorityPlayerId !== playerId || g.activePlayerId !== playerId) return { ok: false, error: 'aguarde sua prioridade' };
            const handCard = g.findCard(playerId, msg.card, ['hand']);
            if (!handCard) return { ok: false, error: 'carta inválida' };
            const c = /land/i.test(handCard.type_line)
                ? (g.phase === 'main1' || g.phase === 'main2' ? g.playLand(playerId, msg.card) : null)
                : g.castSpell(playerId, msg.card)?.card ?? null;
            if (!c) return { ok: false, error: 'carta inválida' };
            pushLog(room, `${playerName(room, playerId)} jogou ${c.name}`);
            return { ok: true };
        }
        case 'tap': {
            if (typeof msg.card !== 'string') return { ok: false, error: 'carta inválida' };
            if (g.priorityPlayerId !== playerId || (g.phase !== 'main1' && g.phase !== 'main2')) return { ok: false, error: 'não pode virar terreno agora' };
            const card = g.findCard(playerId, msg.card, ['lands']);
            const name = card?.name ?? 'carta';
            if (!g.tapForMana(playerId, msg.card)) return { ok: false, error: 'carta inválida' };
            pushLog(room, `${playerName(room, playerId)} virou ${name}`);
            return { ok: true, events: [{ type: 'tap', cardId: msg.card, playerId, text: `${name} gerou mana` }] };
        }
        case 'phase': {
            if (g.activePlayerId !== playerId || g.priorityPlayerId !== playerId || g.stack.length) return { ok: false, error: 'resolva a fila antes de passar de fase' };
            if (g.phase === 'end') g.activePlayerId = otherId(room, playerId); // novo ativo compra/desvira
            g.nextPhase();
            pushLog(room, `Fase: ${g.phase} (turno ${g.turn}, ativo: ${playerName(room, g.activePlayerId)})`);
            return { ok: true, events: [{ type: 'phase', playerId: g.activePlayerId, text: `Fase: ${g.phase}` }] };
        }
        case 'keep': {
            if (!g.keep(playerId)) return { ok: false, error: 'não pode manter esta mão agora' };
            pushLog(room, `${playerName(room, playerId)} manteve a mão`);
            return { ok: true };
        }
        case 'mulligan': {
            if (!g.mulligan(playerId)) return { ok: false, error: 'não pode trocar esta mão agora' };
            pushLog(room, `${playerName(room, playerId)} trocou a mão`);
            return { ok: true };
        }
        case 'cast': {
            if (typeof msg.card !== 'string' || (msg.target !== undefined && typeof msg.target !== 'string')) return { ok: false, error: 'magia inválida' };
            if (g.priorityPlayerId !== playerId) return { ok: false, error: 'aguarde sua prioridade' };
            const item = g.castSpell(playerId, msg.card, msg.target);
            if (!item) return { ok: false, error: 'mana insuficiente ou magia inválida' };
            pushLog(room, `${playerName(room, playerId)} colocou ${item.card.name} na fila`);
            return { ok: true, events: [{ type: 'cast', cardId: item.card.instanceId, playerId, text: `${item.card.name} entrou na fila` }] };
        }
        case 'pass': {
            const events = g.passPriority(playerId);
            if (!events) return { ok: false, error: 'não é sua prioridade' };
            events.forEach((event) => pushLog(room, event.text));
            return { ok: true, events };
        }
        case 'attackers': {
            if (!Array.isArray(msg.cards)) return { ok: false, error: 'ataque inválido' };
            if (!g.declareAttackers(playerId, msg.cards)) return { ok: false, error: 'atacantes inválidos' };
            pushLog(room, `${playerName(room, playerId)} declarou ataque`);
            return { ok: true, events: [{ type: 'attack', playerId, text: 'Ataque declarado' }] };
        }
        case 'blockers': {
            const events = g.declareBlockers(playerId, msg.assignments);
            if (!events) return { ok: false, error: 'bloqueadores inválidos' };
            events.forEach((event) => pushLog(room, event.text));
            return { ok: true, events };
        }
        case 'concede': {
            g.winnerId = otherId(room, playerId);
            g.phase = 'game-over';
            pushLog(room, `${playerName(room, playerId)} concedeu`);
            return { ok: true, events: [{ type: 'win', playerId: g.winnerId, text: `${playerName(room, g.winnerId)} venceu` }] };
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
