import { createCanvas, loadImage, Canvas, CanvasRenderingContext2D } from 'canvas';
import { Game } from './Game';
import { CardInstance, Player } from './types';

// Constants
const CARD_WIDTH = 250;
const CARD_HEIGHT = 350;
const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;

class Renderer {
    async renderGame(game: Game, playerId: string): Promise<Buffer> {
        const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const ctx = canvas.getContext('2d');
        const player = game.players[playerId];

        if (!player) {
             throw new Error("Player not found in game state.");
        }

        // 1. Background
        this._drawBackground(ctx);
        
        // 2. Zones Layout
        // Battlefield: Top (y=50 to y=400) - Scale 1.0
        // Lands: Middle (y=450 to y=695) - Scale 0.7
        // Hand: Bottom (y=750 to 1030) - Scale 0.8
        
        this._drawZoneLabel(ctx, "Battlefield", 50, 40);
        this._drawZoneLabel(ctx, "Lands", 50, 440);
        this._drawZoneLabel(ctx, "Hand", 50, 740);

        // 3. Render Lands (Row 2)
        let x = 50;
        let y = 450;
        for (const card of player.lands) {
            await this._drawCard(ctx, card, x, y, 0.7); 
            x += (CARD_WIDTH * 0.7) + 5;
        }

        // 4. Render Battlefield (Row 1)
        x = 50;
        y = 50;
        for (const card of player.battlefield) {
            await this._drawCard(ctx, card, x, y, 1.0); // Full Size
            x += (CARD_WIDTH * 1.0) + 10;
        }

        // 5. Render Hand (Bottom)
        // Center the hand
        const handScale = 0.8;
        const handWidth = player.hand.length * (CARD_WIDTH * handScale);
        x = (CANVAS_WIDTH - handWidth) / 2;
        y = 750;

        for (const card of player.hand) {
            await this._drawCard(ctx, card, x, y, handScale);
            x += (CARD_WIDTH * handScale) + 5;
        }

        // 6. Stats HUD
        this._drawHUD(ctx, player);

        return canvas.toBuffer();
    }

    _drawBackground(ctx: CanvasRenderingContext2D) {
        // Dark elegant gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
        gradient.addColorStop(0, '#0d0d0d');
        gradient.addColorStop(1, '#1a1a1a');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Divider lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 2;
        
        // Battlefield/Land divider
        ctx.beginPath();
        ctx.moveTo(0, 430);
        ctx.lineTo(CANVAS_WIDTH, 430);
        ctx.stroke();

        // Land/Hand divider
        ctx.beginPath();
        ctx.moveTo(0, 730);
        ctx.lineTo(CANVAS_WIDTH, 730);
        ctx.stroke();
    }

    _drawHUD(ctx: CanvasRenderingContext2D, player: Player) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(CANVAS_WIDTH - 300, 0, 300, 150);
        
        ctx.fillStyle = 'white';
        ctx.font = 'bold 30px Arial';
        ctx.fillText(`Life: ${player.life}`, CANVAS_WIDTH - 280, 50);
        
        // Mana Pool
        let manaText = '';
        Object.entries(player.manaPool).forEach(([color, count]) => {
            if (count > 0) manaText += `${color}:${count}  `;
        });
        
        ctx.font = '24px Arial';
        ctx.fillText(`Mana: ${manaText || 'Empty'}`, CANVAS_WIDTH - 280, 100);
    }

    async _drawCard(ctx: CanvasRenderingContext2D, card: CardInstance, x: number, y: number, scale: number) {
        try {
            const img = await loadImage(card.image_uri || 'https://cards.scryfall.io/large/front/4/c/4c85d097-e87b-41ee-93c6-e63327526ead.jpg?1562848937');
            
            const w = CARD_WIDTH * scale;
            const h = CARD_HEIGHT * scale;

            ctx.save();
            
            // Drop shadow
            ctx.shadowColor = 'black';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetX = 5;
            ctx.shadowOffsetY = 5;

            ctx.translate(x + w/2, y + h/2);

            if (card.tapped) {
                ctx.rotate(90 * Math.PI / 180);
            }

            ctx.drawImage(img, -w/2, -h/2, w, h);
            
            // Summoning Sickness indicator (Cyan border)
            if (card.summoningSickness && !card.tapped && !card.type_line.toLowerCase().includes('land')) {
                ctx.strokeStyle = 'cyan';
                ctx.lineWidth = 4;
                ctx.strokeRect(-w/2, -h/2, w, h);
            }

            // Power/Toughness Overlay (if visible)
            if (card.power && card.toughness && scale > 0.6) {
                // Background box
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.fillRect(w/2 - 50, h/2 - 30, 45, 25);
                
                ctx.fillStyle = 'black';
                ctx.font = 'bold 16px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(`${card.power}/${card.toughness}`, w/2 - 27, h/2 - 12);
            }
            
            ctx.restore();

        } catch (e) {
            console.error("Error drawing card:", e);
            // Fallback placeholder
            ctx.fillStyle = '#333';
            ctx.fillRect(x, y, CARD_WIDTH * scale, CARD_HEIGHT * scale);
            ctx.strokeStyle = 'white';
            ctx.strokeRect(x, y, CARD_WIDTH * scale, CARD_HEIGHT * scale);
            
            ctx.fillStyle = 'white';
            ctx.font = '14px Arial';
            ctx.fillText(card.name.substring(0, 15), x + 5, y + 20);
        }
    }

    _drawZoneLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = 'bold 24px Arial';
        ctx.fillText(text, x, y);
    }
}

export default new Renderer();
