import { User } from 'discord.js';

// Common Interfaces for MTG Bot

export interface DbCard {
    id: string;
    name: string;
    mana_cost: string;
    type_line: string;
    oracle_text: string;
    power?: string;
    toughness?: string;
    image_uri: string;
}

export interface Player {
    id: string; // User ID
    user: User; // Discord User Object
    life: number;
    library: CardInstance[];
    hand: CardInstance[];
    battlefield: CardInstance[];
    graveyard: CardInstance[];
    lands: CardInstance[];
    exile: CardInstance[];
    manaPool: ManaPool;
}

export interface ManaPool {
    W: number;
    U: number;
    B: number;
    R: number;
    G: number;
    C: number;
}

export interface CardInstance extends DbCard {
    instanceId: string;
    ownerId: string;
    tapped: boolean;
    summoningSickness: boolean;
    counters: number;
}
