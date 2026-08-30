import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    AttachmentBuilder,
    ComponentType,
    ChatInputCommandInteraction,
    ButtonInteraction,
    StringSelectMenuInteraction,
    MessageComponentInteraction
} from 'discord.js';
import { Game, Decks, Renderer } from '../../utils/mtg';

console.log('[MTG] Decks importado:', typeof Decks, Decks ? Object.keys(Decks).length + ' decks' : 'undefined');

// Global cache for active games
const activeGames = new Map<string, Game>();

export const data = new SlashCommandBuilder()
    .setName('mtg')
    .setDescription('Inicia uma partida de Magic: The Gathering (Sandbox Mode)');

export async function execute(interaction: ChatInputCommandInteraction) {
    try {
        await interaction.deferReply();
        const userId = interaction.user.id;

        // Validar se Decks foi carregado corretamente
        if (!Decks || typeof Decks !== 'object') {
            console.error('[MTG] Decks não foi importado corretamente:', typeof Decks, Decks);
            await interaction.editReply('❌ Erro: Decks não foi carregado. Problema na importação.');
            return;
        }

        // Deck Selection Step
        const deckKeys = Object.keys(Decks);
        console.log('[MTG] Decks carregados:', deckKeys.length, 'decks disponíveis');

        if (deckKeys.length === 0) {
            await interaction.editReply('❌ Erro: Nenhum deck disponível no momento.');
            return;
        }

        const deckOptions = deckKeys.map((key) => ({
            label: key,
            value: key,
            description: `Deck pré-construído`
        }));

        const row = new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_deck')
                    .setPlaceholder('Escolha seu Deck...')
                    .addOptions(deckOptions)
            );

        console.log(`[MTG] Comando iniciado por ${userId}. ${deckOptions.length} decks disponíveis.`);

        const msg = await interaction.editReply({
            content: '🃏 **Bem-vindo ao MTG Sandbox!**\nPor favor, escolha um deck para começar:',
            components: [row]
        });

        // Collector for Deck Selection
        const selectionCollector = msg.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            filter: i => i.user.id === userId && i.customId === 'select_deck',
            time: 60000,
            max: 1
        });

        selectionCollector.on('collect', async i => {
            try {
                const selectedDeckKey = i.values[0] as keyof typeof Decks;
                
                // Validar se o deck existe
                if (!Decks[selectedDeckKey]) {
                    await i.update({ content: `❌ Erro: Deck **${selectedDeckKey}** não encontrado!`, components: [] });
                    return;
                }

                console.log(`[MTG] Deck selecionado: ${selectedDeckKey} pelo usuário ${userId}`);
                await i.update({ content: `✅ Deck **${selectedDeckKey}** selecionado! Carregando jogo...`, components: [] });
                await startGame(interaction, userId, selectedDeckKey);
            } catch (error) {
                console.error('[MTG] Erro ao selecionar deck:', error);
                try {
                    await i.editReply({ content: '❌ Erro ao selecionar deck. Tente novamente.', components: [] });
                } catch (e) {
                    console.error('[MTG] Erro ao enviar mensagem de erro:', e);
                }
            }
        });

        selectionCollector.on('end', (collected) => {
            if (collected.size === 0) {
                console.log(`[MTG] Timeout de seleção de deck para usuário ${userId}`);
                try {
                    interaction.editReply({ content: '⏱️ Tempo expirado! Você não selecionou um deck.', components: [] }).catch(e => 
                        console.error('[MTG] Erro ao enviar timeout:', e)
                    );
                } catch (e) {
                    console.error('[MTG] Erro crítico no timeout:', e);
                }
            }
        });
    } catch (error) {
        console.error('[MTG] Erro na função execute:', error);
        const errorMsg = error instanceof Error ? error.message : String(error);
        try {
            await interaction.editReply(`❌ Erro ao iniciar o comando: ${errorMsg.substring(0, 100)}`);
        } catch (e) {
            console.error('[MTG] Erro ao enviar mensagem de erro:', e);
        }
    }
}

async function startGame(interaction: ChatInputCommandInteraction, userId: string, deckName: keyof typeof Decks) {
    try {
        const channelId = interaction.channelId;
        const game = new Game(channelId, interaction.user);
        
        console.log(`[MTG] Iniciando jogo para ${userId} com deck ${deckName}`);
        await interaction.editReply("🎲 Embaralhando deck e baixando cartas do Scryfall...");
        
        await game.loadDeck(userId, deckName);
        console.log(`[MTG] Deck carregado com sucesso para ${userId}`);
        game.draw(userId, 7);
        
        activeGames.set(userId, game);

    // Render Function
    const updateBoard = async (i: MessageComponentInteraction | ChatInputCommandInteraction) => {
        try {
            if (!game || !game.players[userId]) {
                console.error('[MTG] Erro: Game ou player não encontrado');
                throw new Error('Game state inválido');
            }

            const buffer = await Renderer.renderGame(game, userId);
            if (!buffer) {
                throw new Error('Falha ao renderizar o tabuleiro');
            }

            const file = new AttachmentBuilder(buffer, { name: 'board.png' });
    
            const player = game.players[userId];
            
            if (!player) {
                throw new Error('Player não encontrado no game');
            }
            
            // --- Components ---
            
            // 1. Hand Selector (Play Card)
            const handOptions = player.hand.map((card) => ({
                label: `${card.name} (${card.mana_cost || '0'})`,
                value: card.instanceId,
                description: card.type_line.substring(0, 50),
                emoji: '🃏'
            }));
    
            const handRow = new ActionRowBuilder<StringSelectMenuBuilder>();
            if (handOptions.length > 0) {
                handRow.addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('play_card')
                        .setPlaceholder('Jogar carta da mão...')
                        .addOptions(handOptions.slice(0, 25)) 
                );
            } else {
                handRow.addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('empty_hand')
                        .setPlaceholder('Mão vazia')
                        .addOptions([{ label: 'Empty', value: 'empty' }])
                        .setDisabled(true)
                );
            }
    
            // 2. Battlefield Selector (Tap/Interact)
            const fieldCards = [...player.lands, ...player.battlefield];
            const fieldOptions = fieldCards.map((card) => ({
                label: `${card.tapped ? '🛑' : '✅'} ${card.name}`,
                value: card.instanceId,
                description: card.tapped ? 'Virada (Tapped)' : 'Disponível',
            }));
    
            const fieldRow = new ActionRowBuilder<StringSelectMenuBuilder>();
            if (fieldOptions.length > 0) {
                 fieldRow.addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('interact_field')
                        .setPlaceholder('Interagir com o campo (Virar/Desvirar)...')
                        .addOptions(fieldOptions.slice(0, 25))
                );
            }
    
            // 3. Destroy/Sacrifice Selector
            const destroyRow = new ActionRowBuilder<StringSelectMenuBuilder>();
            if (fieldOptions.length > 0) {
                 destroyRow.addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('destroy_field')
                        .setPlaceholder('Sacrificar/Destruir permanente...')
                        .addOptions(fieldOptions.slice(0, 25))
                );
            }
    
            // 4. Actions Row
            const actionsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId('draw')
                    .setLabel('Comprar (Draw)')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('untap_all')
                    .setLabel('Desvirar Tudo (Untap)')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('pass')
                    .setLabel('Passar Turno')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('concede')
                    .setLabel('Conceder')
                    .setStyle(ButtonStyle.Danger),
            );
    
            const rows: any[] = [handRow];
            if (fieldOptions.length > 0) rows.push(fieldRow);
            if (fieldOptions.length > 0) rows.push(destroyRow);
            rows.push(actionsRow);
    
            const manaDisplay = `☀️${player.manaPool.W} 💧${player.manaPool.U} 💀${player.manaPool.B} 🔥${player.manaPool.R} 🌳${player.manaPool.G} ⚪${player.manaPool.C}`;
    
            const payload = { 
                content: `🎮 **Turno ${game.turn}** | Vida: ${player.life} ❤️\nMana: ${manaDisplay}`,
                files: [file],
                components: rows,
                embeds: [] 
            };
    
            // Use 'interaction' context if 'i' is from the selection collector, otherwise 'i' is the interaction component
            const targetInteraction = i;
            
            if (targetInteraction.isMessageComponent()) {
                if (targetInteraction.replied || targetInteraction.deferred) {
                    await targetInteraction.editReply(payload);
                } else {
                    await targetInteraction.update(payload);
                }
            } else {
                // ChatInputCommandInteraction only supports reply/editReply
                if (targetInteraction.replied || targetInteraction.deferred) {
                    await targetInteraction.editReply(payload);
                } else {
                    // Should theoretically not happen if deferred in execute, but safe fallback
                    await targetInteraction.reply(payload);
                }
            }
        } catch (error) {
             console.error("Error updating board:", error);
             // Fallback if update fails
             if (i.isRepliable()) {
                 try {
                    await i.editReply({ content: "❌ Erro ao atualizar o tabuleiro." });
                 } catch (e) { console.error("Could not send error message", e); }
             }
        }
    };

    // Initial Render
    await updateBoard(interaction);

    if (!interaction.channel) return;

    const message = await interaction.fetchReply();

    // Collector
    const collector = message.createMessageComponentCollector({ 
        filter: i => i.user.id === userId, 
        time: 3600000 // 1 hour
    });

    collector.on('collect', async (i: StringSelectMenuInteraction | ButtonInteraction) => {
        try {
            await i.deferUpdate();

            if (i.customId === 'draw') {
                game.draw(userId, 1);
            } 
            else if (i.customId === 'untap_all') {
                game.untapAll(userId);
            }
            else if (i.customId === 'play_card' && i.isStringSelectMenu()) {
                const cardId = i.values[0];
                game.playCard(userId, cardId);
            }
            else if (i.customId === 'interact_field' && i.isStringSelectMenu()) {
                const cardId = i.values[0];
                game.tapCard(userId, cardId);
            }
            else if (i.customId === 'destroy_field' && i.isStringSelectMenu()) {
                const cardId = i.values[0];
                game.destroyCard(userId, cardId);
            }
            else if (i.customId === 'concede') {
                await i.editReply({ content: '🏳️ Você concedeu a partida.', components: [] });
                collector.stop();
                return;
            }
            else if (i.customId === 'pass') {
                game.nextPhase();
            }

            await updateBoard(i);
        } catch (e) {
            console.error('[MTG] Erro ao processar ação do componente:', e);
            try {
                if (!i.replied && !i.deferred) {
                    await i.reply({ content: '❌ Erro ao processar ação.', flags: 64 });
                }
            } catch (err) {
                console.error('[MTG] Erro ao enviar mensagem de erro:', err);
            }
        }
    });

    collector.on('end', () => {
        console.log(`[MTG] Partida finalizada para ${userId}`);
        activeGames.delete(userId);
    });
    } catch (error) {
        console.error('[MTG] Erro ao iniciar jogo:', error);
        try {
            await interaction.editReply('❌ Erro ao iniciar o jogo. Tente novamente.');
        } catch (e) {
            console.error('[MTG] Erro ao enviar mensagem de erro:', e);
        }
    }
}
