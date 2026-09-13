import { randomUUID } from 'crypto';
import ScryfallService from './Scryfall';
import { Card } from './Card';
import { Player, CardInstance, ManaPool } from './types';
import { User } from 'discord.js';

export type Phase = 'mulligan' | 'untap' | 'upkeep' | 'draw' | 'main1' | 'combat' | 'main2' | 'end' | 'game-over';

export interface StackItem {
    id: string;
    card: CardInstance;
    controllerId: string;
    kind: 'spell' | 'ability';
    effect: { type: 'permanent' | 'draw' | 'damage' | 'pump' | 'destroy' | 'bounce' | 'counter'; amount?: number };
    targetId?: string;
}

export interface GameEvent {
    type: 'draw' | 'cast' | 'resolve' | 'attack' | 'damage' | 'destroy' | 'life' | 'phase' | 'win' | 'tap';
    cardId?: string;
    targetId?: string;
    playerId?: string;
    amount?: number;
    text: string;
}

export const Decks = {
    "Red Aggro": [
        "Mountain", "Mountain", "Mountain", "Mountain", "Mountain", "Mountain", "Mountain", "Mountain", "Mountain", "Mountain",
        "Lightning Bolt", "Lightning Bolt", "Lightning Bolt", "Lightning Bolt",
        "Shock", "Shock", "Shock", "Shock",
        "Goblin Guide", "Goblin Guide", "Goblin Guide", "Goblin Guide",
        "Monastery Swiftspear", "Monastery Swiftspear", "Monastery Swiftspear", "Monastery Swiftspear",
        "Lightning Bolt", "Lightning Bolt", "Shock", "Shock", "Goblin Guide", "Goblin Guide",
        "Monastery Swiftspear", "Monastery Swiftspear", "Mountain", "Mountain", "Mountain", "Mountain", "Mountain", "Mountain"
    ],
    "Green Stompy": [
        "Forest", "Forest", "Forest", "Forest", "Forest", "Forest", "Forest", "Forest", "Forest", "Forest",
        "Llanowar Elves", "Llanowar Elves", "Llanowar Elves", "Llanowar Elves",
        "Giant Growth", "Giant Growth", "Giant Growth", "Giant Growth",
        "Leatherback Baloth", "Leatherback Baloth", "Leatherback Baloth", "Leatherback Baloth",
        "Rancor", "Rancor", "Rancor", "Rancor",
        "Llanowar Elves", "Llanowar Elves", "Giant Growth", "Giant Growth", "Forest", "Forest", "Forest", "Forest",
        "Forest", "Forest", "Forest", "Forest", "Forest", "Forest"
    ],
    "Blue Tempo": [
        "Island", "Island", "Island", "Island", "Island", "Island", "Island", "Island", "Island", "Island",
        "Unsummon", "Unsummon", "Unsummon", "Unsummon",
        "Delver of Secrets", "Delver of Secrets", "Delver of Secrets", "Delver of Secrets",
        "Ponder", "Ponder", "Ponder", "Ponder",
        "Storm Crow", "Storm Crow", "Storm Crow", "Storm Crow" // Meme value
    ],
    "Black Suicide": [
        "Swamp", "Swamp", "Swamp", "Swamp", "Swamp", "Swamp", "Swamp", "Swamp", "Swamp", "Swamp",
        "Dark Ritual", "Dark Ritual", "Dark Ritual", "Dark Ritual",
        "Vampire Lacerator", "Vampire Lacerator", "Vampire Lacerator", "Vampire Lacerator",
        "Sign in Blood", "Sign in Blood", "Sign in Blood", "Sign in Blood",
        "Duress", "Duress", "Duress", "Duress"
    ],
    "White Weenie": [
        "Plains", "Plains", "Plains", "Plains", "Plains", "Plains", "Plains", "Plains", "Plains", "Plains",
        "Savannah Lions", "Savannah Lions", "Savannah Lions", "Savannah Lions",
        "Honor of the Pure", "Honor of the Pure", "Honor of the Pure", "Honor of the Pure",
        "Swords to Plowshares", "Swords to Plowshares", "Swords to Plowshares", "Swords to Plowshares",
        "Elite Vanguard", "Elite Vanguard", "Elite Vanguard", "Elite Vanguard"
    ],
    "Izzet Spells": [
        "Island", "Island", "Island", "Island", "Mountain", "Mountain", "Mountain", "Mountain", "Mountain", "Mountain",
        "Delver of Secrets", "Delver of Secrets", "Delver of Secrets", "Delver of Secrets",
        "Lightning Bolt", "Lightning Bolt", "Lightning Bolt", "Lightning Bolt",
        "Counterspell", "Counterspell", "Counterspell", "Counterspell",
        "Sprite Dragon", "Sprite Dragon", "Sprite Dragon", "Sprite Dragon"
    ],
    "Golgari Midrange": [
        "Swamp", "Swamp", "Swamp", "Swamp", "Forest", "Forest", "Forest", "Forest", "Forest", "Forest",
        "Llanowar Elves", "Llanowar Elves", "Llanowar Elves", "Llanowar Elves",
        "Thoughtseize", "Thoughtseize", "Thoughtseize", "Thoughtseize",
        "Tarmogoyf", "Tarmogoyf", "Tarmogoyf", "Tarmogoyf",
        "Fatal Push", "Fatal Push", "Fatal Push", "Fatal Push"
    ],
    "Tron": [
        "Forest", "Forest", "Forest", "Forest", "Forest", "Forest", "Forest", "Forest", "Forest", "Forest",
        "Ancient Stirrings", "Ancient Stirrings", "Ancient Stirrings", "Ancient Stirrings",
        "Sylvan Scrying", "Sylvan Scrying", "Sylvan Scrying", "Sylvan Scrying",
        "Wurmcoil Engine", "Wurmcoil Engine", "Wurmcoil Engine", "Wurmcoil Engine",
        "Karn Liberated", "Karn Liberated", "Karn Liberated", "Karn Liberated"
    ]
};

export class Game {
    channelId: string;
    players: { [key: string]: Player };
    turn: number;
    phase: Phase;
    activePlayerId: string;
    priorityPlayerId: string;
    stack: StackItem[];
    winnerId: string | null;
    combat: { attackers: string[]; blockers: Record<string, string> };
    private passedPriority = new Set<string>();

    constructor(channelId: string, hostUser: User) {
        this.channelId = channelId;
        this.players = {};
        this.turn = 1;
        this.phase = 'main1';
        this.activePlayerId = hostUser.id;
        this.priorityPlayerId = hostUser.id;
        this.stack = [];
        this.winnerId = null;
        this.combat = { attackers: [], blockers: {} };
        
        this.addPlayer(hostUser);
    }

    addPlayer(user: User) {
        this.players[user.id] = {
            id: user.id,
            user: user,
            life: 20,
            library: [],
            hand: [],
            battlefield: [],
            graveyard: [],
            lands: [],
            exile: [],
            manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
            kept: false,
            mulliganCount: 0,
            landsPlayedThisTurn: 0,
        };
    }

    startMatch() {
        this.turn = 1;
        this.activePlayerId = Object.keys(this.players)[0];
        this.priorityPlayerId = this.activePlayerId;
        this.phase = 'mulligan';
        this.stack = [];
        this.winnerId = null;
        this.combat = { attackers: [], blockers: {} };
        this.passedPriority.clear();
        for (const player of Object.values(this.players)) {
            player.hand = [];
            player.battlefield = [];
            player.graveyard = [];
            player.lands = [];
            player.exile = [];
            player.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
            player.kept = false;
            player.mulliganCount = 0;
            player.landsPlayedThisTurn = 0;
            this.draw(player.id, 7);
        }
    }

    keep(userId: string): boolean {
        const player = this.players[userId];
        if (!player || this.phase !== 'mulligan' || player.kept) return false;
        player.kept = true;
        if (Object.values(this.players).every((p) => p.kept)) {
            this.phase = 'main1';
            this.priorityPlayerId = this.activePlayerId;
            this.passedPriority.clear();
        }
        return true;
    }

    mulligan(userId: string): boolean {
        const player = this.players[userId];
        if (!player || this.phase !== 'mulligan' || player.kept) return false;
        player.library.push(...player.hand);
        player.hand = [];
        this.shuffle(player.library);
        player.mulliganCount++;
        player.kept = true;
        this.draw(player.id, Math.max(1, 7 - player.mulliganCount));
        if (Object.values(this.players).every((p) => p.kept)) {
            this.phase = 'main1';
            this.priorityPlayerId = this.activePlayerId;
        }
        return true;
    }

    async loadDeck(userId: string, deckName: keyof typeof Decks) {
        const player = this.players[userId];
        if (!player) return;

        const deckList = Decks[deckName] || Decks["Red Aggro"];
        
        player.library = [];
        // ponytail: placeholder garante grimório nunca vazio mesmo se Scryfall falhar/429
        const placeholder = (name: string): import('./types').DbCard => {
            const basics: Record<string, string> = { Mountain: 'R', Forest: 'G', Island: 'U', Swamp: 'B', Plains: 'W' };
            const known: Record<string, Partial<import('./types').DbCard>> = {
                'Lightning Bolt': { mana_cost: '{R}', type_line: 'Instant', oracle_text: 'Lightning Bolt deals 3 damage to any target.' },
                Shock: { mana_cost: '{R}', type_line: 'Instant', oracle_text: 'Shock deals 2 damage to any target.' },
                'Giant Growth': { mana_cost: '{G}', type_line: 'Instant', oracle_text: 'Target creature gets +3/+3 until end of turn.' },
                'Fatal Push': { mana_cost: '{B}', type_line: 'Instant', oracle_text: 'Destroy target creature.' },
                'Swords to Plowshares': { mana_cost: '{W}', type_line: 'Instant', oracle_text: 'Exile target creature.' },
                Unsummon: { mana_cost: '{U}', type_line: 'Instant', oracle_text: 'Return target creature to its owner’s hand.' },
                Ponder: { mana_cost: '{U}', type_line: 'Sorcery', oracle_text: 'Draw a card.' },
                'Sign in Blood': { mana_cost: '{B}{B}', type_line: 'Sorcery', oracle_text: 'Draw two cards.' },
                Counterspell: { mana_cost: '{U}{U}', type_line: 'Instant', oracle_text: 'Counter target spell.' },
                'Llanowar Elves': { mana_cost: '{G}', type_line: 'Creature — Elf Druid', oracle_text: '{T}: Add {G}.', power: '1', toughness: '1' },
                'Goblin Guide': { mana_cost: '{R}', type_line: 'Creature — Goblin Scout', oracle_text: 'Haste', power: '2', toughness: '2' },
                'Monastery Swiftspear': { mana_cost: '{R}', type_line: 'Creature — Human Monk', oracle_text: 'Haste', power: '1', toughness: '2' },
                'Leatherback Baloth': { mana_cost: '{G}{G}{G}', type_line: 'Creature — Beast', oracle_text: '', power: '4', toughness: '5' },
                'Delver of Secrets': { mana_cost: '{U}', type_line: 'Creature — Human Wizard', oracle_text: '', power: '1', toughness: '1' },
                'Storm Crow': { mana_cost: '{1}{U}', type_line: 'Creature — Bird', oracle_text: 'Flying', power: '1', toughness: '2' },
                'Vampire Lacerator': { mana_cost: '{B}', type_line: 'Creature — Vampire Warrior', oracle_text: '', power: '2', toughness: '2' },
                'Savannah Lions': { mana_cost: '{W}', type_line: 'Creature — Cat', oracle_text: '', power: '2', toughness: '1' },
                'Elite Vanguard': { mana_cost: '{W}', type_line: 'Creature — Human Soldier', oracle_text: '', power: '2', toughness: '1' },
                'Sprite Dragon': { mana_cost: '{U}{R}', type_line: 'Creature — Faerie Dragon', oracle_text: 'Flying, haste', power: '1', toughness: '1' },
                Tarmogoyf: { mana_cost: '{1}{G}', type_line: 'Creature — Lhurgoyf', oracle_text: '', power: '2', toughness: '3' },
                'Wurmcoil Engine': { mana_cost: '{6}', type_line: 'Artifact Creature — Wurm', oracle_text: 'Deathtouch, lifelink', power: '6', toughness: '6' },
                'Karn Liberated': { mana_cost: '{7}', type_line: 'Legendary Planeswalker — Karn', oracle_text: '' },
            };
            const isLand = Boolean(basics[name]);
            return {
                id: `placeholder-${name}`,
                name,
                mana_cost: isLand ? '' : (known[name]?.mana_cost ?? '{1}'),
                type_line: isLand ? `Basic Land — ${name}` : (known[name]?.type_line ?? 'Creature'),
                oracle_text: isLand ? `{T}: Add {${basics[name] || 'C'}}.` : (known[name]?.oracle_text ?? `Carta offline: ${name}.`),
                image_uri: `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}&format=image&version=large`,
                power: known[name]?.power ?? (isLand ? undefined : '2'),
                toughness: known[name]?.toughness ?? (isLand ? undefined : '2'),
            };
        };
        for (const cardName of deckList) {
            try {
                const data = await ScryfallService.getCard(cardName);
                if (data && data.image_uri) {
                    player.library.push(new Card(data, userId));
                } else {
                    if (!data) console.warn(`[MTG] Scryfall miss ${cardName}, usando placeholder`);
                    else console.warn(`[MTG] Scryfall sem imagem ${cardName}, usando placeholder`);
                    player.library.push(new Card(placeholder(cardName), userId));
                }
            } catch (e) {
                console.error(`Error loading card ${cardName}:`, e);
                player.library.push(new Card(placeholder(cardName), userId));
            }
        }
        this.shuffle(player.library);
        console.log(`[MTG] Deck ${deckName} p/ ${userId}: ${player.library.length}/${deckList.length} cartas`);
        if (player.library.length !== deckList.length) {
            console.error(`[MTG] ERRO grimório incompleto ${deckName}: ${player.library.length}/${deckList.length}`);
        }
    }

    shuffle(array: any[]) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    findCard(userId: string, cardInstanceId: string, zones: ('hand' | 'battlefield' | 'lands')[] = ['hand', 'battlefield', 'lands']): CardInstance | null {
        const player = this.players[userId];
        if (!player) return null;
        for (const zone of zones) {
            const card = player[zone].find((c) => c.instanceId === cardInstanceId);
            if (card) return card;
        }
        return null;
    }

    private findOwner(cardInstanceId: string): { player: Player; card: CardInstance } | null {
        for (const player of Object.values(this.players)) {
            const card = this.findCard(player.id, cardInstanceId, ['battlefield', 'lands']);
            if (card) return { player, card };
        }
        return null;
    }

    private isLand(card: CardInstance): boolean {
        return /land/i.test(card.type_line);
    }

    private landColor(card: CardInstance): keyof ManaPool {
        if (/mountain/i.test(card.name)) return 'R';
        if (/forest/i.test(card.name)) return 'G';
        if (/island/i.test(card.name)) return 'U';
        if (/swamp/i.test(card.name)) return 'B';
        if (/plains/i.test(card.name)) return 'W';
        return 'C';
    }

    private cost(card: CardInstance): { colored: Partial<ManaPool>; generic: number } {
        const colored: Partial<ManaPool> = {};
        let generic = 0;
        for (const token of card.mana_cost.match(/\{([^}]+)\}/g) ?? []) {
            const symbol = token.slice(1, -1);
            if (/^[WUBRGC]$/.test(symbol)) colored[symbol as keyof ManaPool] = (colored[symbol as keyof ManaPool] ?? 0) + 1;
            else if (/^\d+$/.test(symbol)) generic += Number(symbol);
        }
        return { colored, generic };
    }

    private canPay(player: Player, card: CardInstance): boolean {
        const cost = this.cost(card);
        let available = player.manaPool.C;
        for (const color of ['W', 'U', 'B', 'R', 'G'] as const) {
            const need = cost.colored[color] ?? 0;
            if (player.manaPool[color] < need) return false;
            available += player.manaPool[color] - need;
        }
        return available >= cost.generic;
    }

    private pay(player: Player, card: CardInstance): void {
        const cost = this.cost(card);
        for (const color of ['W', 'U', 'B', 'R', 'G'] as const) {
            player.manaPool[color] -= cost.colored[color] ?? 0;
        }
        let generic = cost.generic;
        for (const color of ['C', 'W', 'U', 'B', 'R', 'G'] as const) {
            const spent = Math.min(generic, player.manaPool[color]);
            player.manaPool[color] -= spent;
            generic -= spent;
        }
    }

    playLand(userId: string, cardInstanceId: string): CardInstance | null {
        const player = this.players[userId];
        const card = player ? this.findCard(userId, cardInstanceId) : null;
        if (!player || !card || !this.isLand(card) || player.landsPlayedThisTurn >= 1) return null;
        const index = player.hand.findIndex((c) => c.instanceId === cardInstanceId);
        if (index < 0) return null;
        const played = player.hand.splice(index, 1)[0];
        player.lands.push(played);
        player.landsPlayedThisTurn++;
        played.summoningSickness = false;
        return played;
    }

    tapForMana(userId: string, cardInstanceId: string): CardInstance | null {
        const player = this.players[userId];
        const card = player ? player.lands.find((c) => c.instanceId === cardInstanceId) : null;
        if (!player || !card || card.tapped) return null;
        card.tapped = true;
        player.manaPool[this.landColor(card)]++;
        return card;
    }

    castSpell(userId: string, cardInstanceId: string, targetId?: string): StackItem | null {
        const player = this.players[userId];
        const card = player?.hand.find((c) => c.instanceId === cardInstanceId);
        if (!player || !card || this.isLand(card) || !this.canPay(player, card)) return null;
        const needsTarget = /target|any target/i.test(card.oracle_text) || /lightning bolt|shock|giant growth|fatal push|swords to plowshares|unsummon|counterspell/i.test(card.name);
        if (needsTarget && !this.validTarget(targetId)) return null;
        const index = player.hand.findIndex((c) => c.instanceId === cardInstanceId);
        this.pay(player, card);
        player.hand.splice(index, 1);
        const name = card.name.toLowerCase();
        let effect: StackItem['effect'] = { type: /creature|artifact|enchantment|planeswalker/i.test(card.type_line) ? 'permanent' : 'draw', amount: 1 };
        if (/lightning bolt/i.test(name)) effect = { type: 'damage', amount: 3 };
        else if (/shock/i.test(name)) effect = { type: 'damage', amount: 2 };
        else if (/giant growth/i.test(name)) effect = { type: 'pump', amount: 3 };
        else if (/fatal push|swords to plowshares/i.test(name)) effect = { type: 'destroy' };
        else if (/unsummon/i.test(name)) effect = { type: 'bounce' };
        else if (/counterspell/i.test(name)) effect = { type: 'counter' };
        else if (/sign in blood/i.test(name)) effect = { type: 'draw', amount: 2 };
        else if (/ponder|opt/i.test(name)) effect = { type: 'draw', amount: 1 };
        const item: StackItem = { id: randomUUID(), card, controllerId: userId, kind: 'spell', effect, targetId };
        this.stack.push(item);
        this.priorityPlayerId = this.otherPlayerId(userId);
        this.passedPriority.clear();
        return item;
    }

    private otherPlayerId(userId: string): string {
        return Object.keys(this.players).find((id) => id !== userId) ?? userId;
    }

    private validTarget(targetId: string | undefined): boolean {
        if (!targetId) return false;
        if (this.players[targetId] || this.stack.some((item) => item.id === targetId)) return true;
        return Boolean(this.findOwner(targetId));
    }

    passPriority(userId: string): GameEvent[] | null {
        if (userId !== this.priorityPlayerId) return null;
        this.passedPriority.add(userId);
        if (this.passedPriority.size < Object.keys(this.players).length) {
            this.priorityPlayerId = this.otherPlayerId(userId);
            return [];
        }
        this.passedPriority.clear();
        if (!this.stack.length) {
            this.priorityPlayerId = this.activePlayerId;
            return [];
        }
        const item = this.stack.pop()!;
        const events = this.resolve(item);
        this.priorityPlayerId = this.activePlayerId;
        return events;
    }

    private resolve(item: StackItem): GameEvent[] {
        const events: GameEvent[] = [{ type: 'resolve', cardId: item.card.instanceId, playerId: item.controllerId, text: `${item.card.name} resolveu` }];
        const owner = this.players[item.controllerId];
        if (item.effect.type === 'counter') {
            const countered = this.stack.pop();
            if (countered) this.players[countered.controllerId].graveyard.push(countered.card);
            owner.graveyard.push(item.card);
            return events;
        }
        if (item.effect.type === 'permanent') {
            owner.battlefield.push(item.card);
            return events;
        }
        const target = item.targetId ? this.findOwner(item.targetId) : null;
        if (item.effect.type === 'draw') this.draw(item.controllerId, item.effect.amount ?? 1);
        if (item.effect.type === 'damage') {
            const targetPlayer = this.players[item.targetId ?? ''];
            if (targetPlayer) {
                targetPlayer.life -= item.effect.amount ?? 0;
                events.push({ type: 'damage', playerId: targetPlayer.id, amount: item.effect.amount, text: `${item.card.name} causou ${item.effect.amount} dano` });
            } else if (target) {
                target.card.damageMarked += item.effect.amount ?? 0;
            }
        }
        if (item.effect.type === 'pump' && target) {
            target.card.powerBonus += item.effect.amount ?? 0;
            target.card.toughnessBonus += item.effect.amount ?? 0;
            target.card.counters++;
        }
        if (item.effect.type === 'destroy' && target) {
            this.moveToGraveyard(target.player, target.card.instanceId);
            events.push({ type: 'destroy', cardId: target.card.instanceId, text: `${target.card.name} foi destruída` });
        }
        if (item.effect.type === 'bounce' && target) {
            const bounced = this.removeFromZone(target.player, target.card.instanceId, 'battlefield');
            if (bounced) target.player.hand.push(bounced);
        }
        owner.graveyard.push(item.card);
        this.removeLethal(events);
        this.checkWinner(events);
        return events;
    }

    private removeFromZone(player: Player, cardInstanceId: string, zone: 'battlefield' | 'lands'): CardInstance | null {
        const cards = player[zone];
        const index = cards.findIndex((c) => c.instanceId === cardInstanceId);
        return index < 0 ? null : cards.splice(index, 1)[0];
    }

    private moveToGraveyard(player: Player, cardInstanceId: string): CardInstance | null {
        const card = this.removeFromZone(player, cardInstanceId, 'battlefield') ?? this.removeFromZone(player, cardInstanceId, 'lands');
        if (card) player.graveyard.push(card);
        return card;
    }

    private removeLethal(events: GameEvent[]): void {
        for (const player of Object.values(this.players)) {
            for (const card of [...player.battlefield]) {
                const toughness = Number(card.toughness ?? 0) + card.toughnessBonus;
                if (toughness > 0 && card.damageMarked >= toughness) {
                    this.moveToGraveyard(player, card.instanceId);
                    events.push({ type: 'destroy', cardId: card.instanceId, text: `${card.name} foi destruída` });
                }
                card.damageMarked = 0;
            }
        }
    }

    private checkWinner(events: GameEvent[]): void {
        if (this.winnerId) return;
        const players = Object.values(this.players);
        const defeated = players.find((p) => p.life <= 0 || p.library.length === 0);
        if (!defeated) return;
        this.winnerId = this.otherPlayerId(defeated.id);
        this.phase = 'game-over';
        this.priorityPlayerId = this.winnerId;
        events.push({ type: 'win', playerId: this.winnerId, text: `${this.players[this.winnerId].user.username} venceu` });
    }

    declareAttackers(userId: string, cardIds: string[]): boolean {
        if (this.phase !== 'combat' || this.activePlayerId !== userId || this.priorityPlayerId !== userId || !Array.isArray(cardIds) || new Set(cardIds).size !== cardIds.length) return false;
        const player = this.players[userId];
        const attackers = cardIds.map((id) => player.battlefield.find((c) => c.instanceId === id));
        if (attackers.some((c) => !c || c.tapped || c.summoningSickness)) return false;
        this.combat = { attackers: cardIds, blockers: {} };
        for (const card of attackers as CardInstance[]) card.tapped = true;
        this.priorityPlayerId = this.otherPlayerId(userId);
        return true;
    }

    declareBlockers(userId: string, assignments: Record<string, string>): GameEvent[] | null {
        if (this.phase !== 'combat' || this.priorityPlayerId !== userId || !assignments || typeof assignments !== 'object') return null;
        const defender = this.players[userId];
        const attackerIds = new Set(this.combat.attackers);
        const used = new Set<string>();
        for (const [attackerId, blockerId] of Object.entries(assignments)) {
            if (!attackerIds.has(attackerId) || used.has(blockerId)) return null;
            const blocker = defender.battlefield.find((c) => c.instanceId === blockerId);
            if (!blocker || blocker.tapped || blocker.summoningSickness) return null;
            used.add(blockerId);
        }
        this.combat.blockers = { ...assignments };
        const events: GameEvent[] = [{ type: 'attack', playerId: this.activePlayerId, text: `${this.players[this.activePlayerId].user.username} atacou` }];
        const defending = defender;
        for (const attackerId of this.combat.attackers) {
            const attacker = this.players[this.activePlayerId].battlefield.find((c) => c.instanceId === attackerId);
            const blockerId = this.combat.blockers[attackerId];
            const blocker = blockerId ? defending.battlefield.find((c) => c.instanceId === blockerId) : null;
            if (!attacker) continue;
            const attackPower = Math.max(0, Number(attacker.power ?? 0) + attacker.powerBonus);
            if (!blocker) {
                defending.life -= attackPower;
                events.push({ type: 'damage', playerId: defending.id, amount: attackPower, text: `${attacker.name} causou ${attackPower} dano` });
                continue;
            }
            const blockPower = Math.max(0, Number(blocker.power ?? 0) + blocker.powerBonus);
            blocker.damageMarked += attackPower;
            attacker.damageMarked += blockPower;
        }
        this.removeLethal(events);
        this.checkWinner(events);
        if (!this.winnerId) this.phase = 'main2';
        this.priorityPlayerId = this.activePlayerId;
        this.combat = { attackers: [], blockers: {} };
        return events;
    }

    draw(userId: string, amount: number = 1): boolean {
        const player = this.players[userId];
        if (!player) return false;

        for (let i = 0; i < amount; i++) {
            if (player.library.length > 0) {
                const card = player.library.pop();
                if (card) player.hand.push(card);
            } else {
                return false; // Mill out
            }
        }
        return true;
    }

    playCard(userId: string, cardInstanceId: string): CardInstance | null {
        const player = this.players[userId];
        if (!player) return null;

        const cardIndex = player.hand.findIndex(c => c.instanceId === cardInstanceId);
        if (cardIndex === -1) return null;

        const card = player.hand[cardIndex];
        
        // Basic Logic: Land vs Non-Land
        if (card.type_line.toLowerCase().includes('land')) {
            player.lands.push(card);
        } else {
            player.battlefield.push(card);
        }
        
        player.hand.splice(cardIndex, 1);
        return card;
    }

    tapCard(userId: string, cardInstanceId: string): boolean {
        const player = this.players[userId];
        if (!player) return false;

        let card = player.lands.find(c => c.instanceId === cardInstanceId);
        let isLand = true;
        
        if (!card) {
            card = player.battlefield.find(c => c.instanceId === cardInstanceId);
            isLand = false;
        }
        
        if (card) {
            card.tapped = !card.tapped;
            
            // Auto-Mana Logic
            if (isLand && card.tapped) {
                 if (card.name.includes('Mountain')) player.manaPool.R++;
                 else if (card.name.includes('Forest')) player.manaPool.G++;
                 else if (card.name.includes('Island')) player.manaPool.U++;
                 else if (card.name.includes('Swamp')) player.manaPool.B++;
                 else if (card.name.includes('Plains')) player.manaPool.W++;
            } else if (isLand && !card.tapped) {
                 // Simple Undo
                 if (card.name.includes('Mountain')) player.manaPool.R = Math.max(0, player.manaPool.R - 1);
                 else if (card.name.includes('Forest')) player.manaPool.G = Math.max(0, player.manaPool.G - 1);
                 else if (card.name.includes('Island')) player.manaPool.U = Math.max(0, player.manaPool.U - 1);
                 else if (card.name.includes('Swamp')) player.manaPool.B = Math.max(0, player.manaPool.B - 1);
                 else if (card.name.includes('Plains')) player.manaPool.W = Math.max(0, player.manaPool.W - 1);
            }
            return true;
        }
        return false;
    }

    destroyCard(userId: string, cardInstanceId: string): boolean {
        const player = this.players[userId];
        if (!player) return false;
        
        // Check Battlefield
        let index = player.battlefield.findIndex(c => c.instanceId === cardInstanceId);
        if (index !== -1) {
            const card = player.battlefield.splice(index, 1)[0];
            player.graveyard.push(card);
            return true;
        }
        
        // Check Lands (Land destruction)
        index = player.lands.findIndex(c => c.instanceId === cardInstanceId);
        if (index !== -1) {
            const card = player.lands.splice(index, 1)[0];
            player.graveyard.push(card);
            return true;
        }
        return false;
    }

    untapAll(userId: string) {
        const player = this.players[userId];
        if (!player) return;

        player.lands.forEach(c => {
            c.tapped = false;
        });
        player.battlefield.forEach(c => {
            c.tapped = false;
            c.summoningSickness = false; // Remove summoning sickness at start of turn
        });
        // Reset mana? Usually mana empties at end of phase, but for sandbox, maybe keep it until spent? 
        // Rules say empty at end of phase.
        player.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    }

    nextPhase() {
        const phases: Phase[] = ['untap', 'upkeep', 'draw', 'main1', 'combat', 'main2', 'end'];
        let idx = phases.indexOf(this.phase);
        if (idx < 0 || this.phase === 'game-over') return;
        idx++;
        
        if (idx >= phases.length) {
            // End of turn
            this.phase = 'untap';
            this.turn++;
            // Switch active player logic would go here for 2 players
        } else {
            this.phase = phases[idx];
        }

        // Auto-actions on phase change
        if (this.phase === 'untap') {
            this.untapAll(this.activePlayerId);
        }
        if (this.phase === 'draw') {
            this.draw(this.activePlayerId, 1);
        }
        this.priorityPlayerId = this.activePlayerId;
        this.passedPriority.clear();
        if (this.phase === 'untap') {
            for (const player of Object.values(this.players)) {
                for (const card of player.battlefield) {
                    card.powerBonus = 0;
                    card.toughnessBonus = 0;
                    card.damageMarked = 0;
                }
            }
        }
    }
}
