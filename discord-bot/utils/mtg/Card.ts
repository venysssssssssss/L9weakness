import { v4 as uuidv4 } from 'uuid';
import { DbCard, CardInstance } from './types';

export class Card implements CardInstance {
    id: string;
    name: string;
    mana_cost: string;
    type_line: string;
    oracle_text: string;
    power?: string;
    toughness?: string;
    image_uri: string;
    
    instanceId: string;
    ownerId: string;
    tapped: boolean;
    summoningSickness: boolean;
    counters: number;

    constructor(data: DbCard, ownerId: string) {
        this.id = data.id;
        this.name = data.name;
        this.mana_cost = data.mana_cost;
        this.type_line = data.type_line;
        this.oracle_text = data.oracle_text;
        this.power = data.power;
        this.toughness = data.toughness;
        this.image_uri = data.image_uri;

        this.instanceId = uuidv4();
        this.ownerId = ownerId;
        this.tapped = false;
        this.summoningSickness = true;
        this.counters = 0;
    }
}
