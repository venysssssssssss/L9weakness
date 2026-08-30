import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  ChannelType,
} from 'discord.js';
import { queueManager } from '../../utils/music/QueueManager';
import { resolveQuery } from '../../utils/music/Resolver';

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Toca música do YouTube ou Spotify (link ou busca)')
  .addStringOption((opt) =>
    opt
      .setName('query')
      .setDescription('Nome da música, link do YouTube ou link do Spotify (track/playlist/album)')
      .setRequired(true)
  )
  .addStringOption((opt) =>
    opt
      .setName('fonte')
      .setDescription('Forçar fonte (opcional)')
      .setRequired(false)
      .addChoices(
        { name: 'YouTube', value: 'youtube' },
        { name: 'Spotify', value: 'spotify' },
        { name: 'Busca', value: 'search' }
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const query = interaction.options.getString('query', true);
  const member = interaction.member as GuildMember;

  const voiceChannel = member?.voice?.channel;
  if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
    await interaction.editReply('❌ Você precisa estar em um canal de voz para usar `/play`.');
    return;
  }

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply('❌ Este comando só pode ser usado em servidores.');
    return;
  }

  // Check bot permissions
  const permissions = voiceChannel.permissionsFor(guild.members.me!);
  if (!permissions?.has('Connect') || !permissions?.has('Speak')) {
    await interaction.editReply('❌ Preciso das permissões **Conectar** e **Falar** no seu canal de voz.');
    return;
  }

  // If queue exists and bot is in different channel
  const existingQueue = queueManager.get(guild.id);
  if (existingQueue && existingQueue.voiceChannelId !== voiceChannel.id && existingQueue.connection) {
    await interaction.editReply(`❌ Já estou tocando em <#${existingQueue.voiceChannelId}>. Entre lá ou use \`/leave\` primeiro.`);
    return;
  }

  await interaction.editReply(`🔍 Buscando: \`${query.substring(0, 100)}\`... (YouTube/Spotify)`);

  let resolved: { tracks: any[]; playlistTitle?: string };
  try {
    resolved = await resolveQuery(query, interaction.user.id, interaction.user.tag);
  } catch (e: any) {
    console.error('[Play] resolve error', e.message);
    await interaction.editReply(`❌ Erro ao buscar: ${e.message}`);
    return;
  }

  if (!resolved.tracks || resolved.tracks.length === 0) {
    await interaction.editReply('❌ Nenhuma faixa encontrada. Tente outro link ou busca.');
    return;
  }

  const isPlaylist = resolved.tracks.length > 1;

  // Get or create queue
  const queue = queueManager.create(guild.id, voiceChannel.id, interaction.channelId);

  // Connect if needed
  try {
    await queue.connect(voiceChannel);
  } catch (e: any) {
    queueManager.delete(guild.id);
    await interaction.editReply(`❌ Falha ao entrar no canal de voz: ${e.message}`);
    return;
  }

  const wasEmpty = !queue.current && queue.tracks.length === 0;
  queue.addTracks(resolved.tracks);

  // Start playing if idle
  if (wasEmpty) {
    queue.processQueue().catch((e) => console.error('[Play] processQueue error', e));
  }

  // Build embed response
  if (isPlaylist) {
    const count = resolved.tracks.length;
    const title = resolved.playlistTitle || 'Playlist';
    const totalDuration = resolved.tracks.reduce((acc: number, t: any) => acc + (t.duration || 0), 0);
    const preview = resolved.tracks.slice(0, 5).map((t: any, i: number) => `**${i + 1}.** ${t.title} \`${t.durationFormatted}\``).join('\n');
    const more = count > 5 ? `\n*e mais ${count - 5} faixas...*` : '';

    const embed = new EmbedBuilder()
      .setTitle('🎶 Playlist adicionada à fila')
      .setDescription(`**${title}** — ${count} faixas\n\n${preview}${more}`)
      .setColor(0x1db954)
      .setThumbnail(resolved.tracks[0]?.thumbnail || null)
      .setFooter({ text: `Solicitado por ${interaction.user.tag} • Total ~${Math.floor(totalDuration / 60)} min` })
      .setTimestamp();

    await interaction.editReply({ content: `✅ Adicionei **${count}** faixas à fila ${wasEmpty ? 'e comecei a tocar!' : ''}`, embeds: [embed] });
  } else {
    const track = resolved.tracks[0];
    const embed = new EmbedBuilder()
      .setTitle(wasEmpty ? '▶️ Tocando agora' : '➕ Adicionado à fila')
      .setDescription(`**[${track.title}](${track.url})**\n\`${track.durationFormatted}\` • ${track.channel || 'YouTube'} • ${track.source === 'spotify' ? 'via Spotify 🔗' : 'YouTube ▶️'}`)
      .setColor(wasEmpty ? 0x00ff00 : 0x0099ff)
      .setThumbnail(track.thumbnail)
      .setFooter({ text: `Solicitado por ${track.requesterTag} • Posição: ${wasEmpty ? '1 (agora)' : queue.size() + (queue.current ? 1 : 0)}` })
      .setTimestamp();

    if (track.spotifyUrl) embed.setURL(track.spotifyUrl);

    await interaction.editReply({ content: wasEmpty ? `🎧 Tocando **${track.title}**` : `✅ Adicionado à fila`, embeds: [embed] });
  }
}

export default { data, execute };
