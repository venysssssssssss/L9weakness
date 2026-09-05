import ScryfallService from './Scryfall';
import { Card } from './Card';
import { Player, CardInstance, ManaPool } from './types';
import { User } from 'discord.js';

type Phase = 'untap' | 'upkeep' | 'draw' | 'main1' | 'combat' | 'main2' | 'end';

export const Decks = {
    "Red Aggro": [
        "Mountain", "Mountain", "Mountain", "Mountain", "Mountain", "Mountain", "Mountain", "Mountain", "Mountain", "Mountain",
        "Lightning Bolt", "Lightning Bolt", "Lightning Bolt", "Lightning Bolt",
        "Shock", "Shock", "Shock", "Shock",
        "Goblin Guide", "Goblin Guide", "Goblin Guide", "Goblin Guide",
        "Monastery Swiftspear", "Monastery Swiftspear", "Monastery Swiftspear", "Monastery Swiftspear"
    ],
    "Green Stompy": [
        "Forest", "Forest", "Forest", "Forest", "Forest", "Forest", "Forest", "Forest", "Forest", "Forest",
        "Llanowar Elves", "Llanowar Elves", "Llanowar Elves", "Llanowar Elves",
        "Giant Growth", "Giant Growth", "Giant Growth", "Giant Growth",
        "Leatherback Baloth", "Leatherback Baloth", "Leatherback Baloth", "Leatherback Baloth",
        "Rancor", "Rancor", "Rancor", "Rancor"
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

    constructor(channelId: string, hostUser: User) {
        this.channelId = channelId;
        this.players = {};
        this.turn = 1;
        this.phase = 'main1';
        this.activePlayerId = hostUser.id;
        
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
            manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }
        };
    }

    async loadDeck(userId: string, deckName: keyof typeof Decks) {
        const player = this.players[userId];
        if (!player) return;

        const deckList = Decks[deckName] || Decks["Red Aggro"];
        
        player.library = [];
        // ponytail: placeholder garante grimório nunca vazio mesmo se Scryfall falhar/429
        const placeholder = (name: string): import('./types').DbCard => {
            const isLand = ['Mountain','Forest','Island','Swamp','Plains'].includes(name);
            const mana: Record<string,string> = { Mountain:'R', Forest:'G', Island:'U', Swamp:'B', Plains:'W' };
            return {
                id: `placeholder-${name}`,
                name,
                mana_cost: isLand ? '' : '',
                type_line: isLand ? `Basic Land — ${name}` : 'Placeholder',
                oracle_text: isLand ? `{T}: Add {${mana[name] || 'C'}}.` : `Placeholder para ${name} (Scryfall offline).`,
                image_uri: `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}&format=image&version=large`,
                power: isLand ? undefined : '2',
                toughness: isLand ? undefined : '2',
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
    }
}
