import db from './db';
import { DbCard } from './types';
import Database from 'better-sqlite3';

interface ScryfallCardResponse {
    id: string;
    name: string;
    mana_cost?: string;
    type_line: string;
    oracle_text?: string;
    image_uris?: {
        png: string;
        large: string;
        normal: string;
    };
    card_faces?: {
        mana_cost: string;
        oracle_text: string;
        image_uris?: {
            png: string;
            large: string;
            normal: string;
        };
    }[];
    power?: string;
    toughness?: string;
    colors?: string[];
    cmc?: number;
}

class ScryfallService {
    private getCardStmt: Database.Statement;
    private insertCardStmt: Database.Statement;

    constructor() {
        this.getCardStmt = db.prepare('SELECT * FROM cards WHERE name = ? COLLATE NOCASE');
        this.insertCardStmt = db.prepare(`
            INSERT OR REPLACE INTO cards (id, name, mana_cost, type_line, oracle_text, image_uri, power, toughness, colors, cmc)
            VALUES (@id, @name, @mana_cost, @type_line, @oracle_text, @image_uri, @power, @toughness, @colors, @cmc)
        `);
    }

    async getCard(name: string): Promise<DbCard | null> {
        try {
            // 1. Check Cache
            const cached = this.getCardStmt.get(name) as DbCard | undefined;
            if (cached) {
                // console.log(`[Cache Hit] ${name}`);
                return cached;
            }

            // 2. Fetch from API
            console.log(`[API Fetch] ${name}`);
            const url = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`;
            
            const response = await fetch(url);
            if (!response.ok) {
                console.warn(`Scryfall API Warning: ${response.statusText} for card ${name}`);
                return null;
            }
            
            const data = (await response.json()) as ScryfallCardResponse;
            
            // 3. Process and Save
            const cardData = this._transformData(data);
            this.insertCardStmt.run(cardData);
            
            return cardData;
        } catch (error) {
            console.error(`Failed to fetch card ${name}:`, error);
            return null;
        }
    }

    private _transformData(data: ScryfallCardResponse): any {
        // Handle dual-faced cards (DFC)
        let image_uri = '';
        if (data.image_uris) {
            image_uri = data.image_uris.png || data.image_uris.large || data.image_uris.normal;
        } else if (data.card_faces && data.card_faces[0].image_uris) {
            const face = data.card_faces[0];
            image_uri = face.image_uris?.png || face.image_uris?.large || face.image_uris?.normal || '';
        }

        return {
            id: data.id,
            name: data.name,
            mana_cost: data.mana_cost || (data.card_faces ? data.card_faces[0].mana_cost : ''),
            type_line: data.type_line,
            oracle_text: data.oracle_text || (data.card_faces ? data.card_faces[0].oracle_text : ''),
            image_uri: image_uri,
            power: data.power || null,
            toughness: data.toughness || null,
            colors: data.colors ? JSON.stringify(data.colors) : null,
            cmc: data.cmc || 0
        };
    }
}

export default new ScryfallService();
