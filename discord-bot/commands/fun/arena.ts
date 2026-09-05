import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { Decks } from '../../utils/mtg';
import { createRoom, pushLog } from '../../arena/rooms';
import { broadcastState, ensureArenaServer, getArenaBaseUrl } from '../../arena/server';

const deckChoices = Object.keys(Decks).slice(0, 25).map((k) => ({ name: k, value: k }));
const DEFAULT_HOST_DECK = 'Red Aggro';
const DEFAULT_GUEST_DECK = 'Green Stompy';

export const data = new SlashCommandBuilder()
    .setName('arena')
    .setDescription('Cria uma sala da Arena MTG 1v1 e envia o link aos dois duelistas')
    .addUserOption((o) => o.setName('oponente').setDescription('Quem você desafia').setRequired(true))
    .addStringOption((o) => o.setName('deck-host').setDescription('Seu deck').addChoices(...deckChoices))
    .addStringOption((o) => o.setName('deck-guest').setDescription('Deck do oponente').addChoices(...deckChoices));

const validDeck = (v: string | null, fallback: string): keyof typeof Decks =>
    (v && (Decks as Record<string, unknown>)[v] ? v : fallback) as keyof typeof Decks;

export async function execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    try {
        const host = interaction.user;
        const guest = interaction.options.getUser('oponente', true);
        if (guest.bot) {
            await interaction.editReply('❌ Duelo contra bot ainda não — chama um humano.');
            return;
        }
        if (guest.id === host.id) {
            await interaction.editReply('❌ Você não pode duelar contra si mesmo. Marque um oponente.');
            return;
        }
        const hostDeck = validDeck(interaction.options.getString('deck-host'), DEFAULT_HOST_DECK);
        const guestDeck = validDeck(interaction.options.getString('deck-guest'), DEFAULT_GUEST_DECK);

        ensureArenaServer();
        const { room, hostKey, guestKey } = createRoom(interaction.channelId, host, guest);
        const base = getArenaBaseUrl();
        const hostLink = `${base}/arena/${room.id}?key=${hostKey}`;
        const guestLink = `${base}/arena/${room.id}?key=${guestKey}`;

        await interaction.editReply(
            `🃏 **Arena criada!** ${host} vs ${guest}\n` +
            `📦 ${hostDeck} × ${guestDeck} • sala dura 4h sem movimento\n` +
            `🔑 Links pessoais enviados por DM (não compartilhem — quem tem o link joga).`
        );
        if (!process.env.ARENA_BASE_URL) {
            await interaction.followUp({
                content: '⚠️ `ARENA_BASE_URL` não configurada — os links usam `localhost` e só abrem nesta máquina. Configure a URL pública no `.env` do bot.',
                ephemeral: true,
            });
        }

        const dmHost = host.send(`⚔️ Sua arena contra **${guest.username}** (${hostDeck}):\n${hostLink}`).catch(() => null);
        const dmGuest = guest.send(`⚔️ **${host.username}** te desafiou na Arena MTG (${guestDeck}):\n${guestLink}`).catch(() => null);
        const [okHost, okGuest] = await Promise.all([dmHost, dmGuest]);
        if (!okHost) {
            await interaction.followUp({ content: `🔑 Seu link (DM fechada):\n${hostLink}`, ephemeral: true });
        }
        if (!okGuest) {
            await host.send(`📨 ${guest.username} está com a DM fechada — encaminhe o link dele:\n${guestLink}`).catch(() => null);
        }

        // Carrega em segundo plano para não estourar o timeout da interação (Scryfall é lento a frio).
        void (async () => {
            try {
                await room.game.loadDeck(room.hostId, hostDeck);
                await room.game.loadDeck(room.guestId, guestDeck);
                room.game.draw(room.hostId, 7);
                room.game.draw(room.guestId, 7);
                room.ready = true;
                pushLog(room, `Decks prontos — ${host.username} começa!`);
            } catch (e) {
                console.error('[Arena] falha ao carregar decks:', e);
                pushLog(room, '❌ Falha ao buscar cartas no Scryfall. Tente um novo /arena.');
            }
            broadcastState(room.id);
        })();
    } catch (error) {
        console.error('[Arena] erro no comando:', error);
        try {
            await interaction.editReply('❌ Erro ao criar a arena. Tente de novo.');
        } catch { /* interação já foi */ }
    }
}
