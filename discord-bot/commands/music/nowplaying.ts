import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { queueManager } from '../../utils/music/QueueManager';

export const data = new SlashCommandBuilder()
  .setName('nowplaying')
  .setDescription('Mostra a música tocando agora')
  .addStringOption((o) => o.setName('alias').setDescription('alias').setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const queue = queueManager.get(interaction.guildId!);
  if (!queue || !queue.current) {
    await interaction.editReply('🔇 Nada tocando agora.');
    return;
  }
  const t = queue.current;
  const embed = new EmbedBuilder()
    .setTitle('🎧 Tocando agora')
    .setDescription(`**[${t.title}](${t.url})**\n\`${t.durationFormatted}\` • ${t.channel || 'Desconhecido'} • ${t.source === 'spotify' ? 'Spotify 🟢 via YouTube' : 'YouTube 🔴'}`)
    .setThumbnail(t.thumbnail)
    .setColor(0x1db954)
    .addFields(
      { name: 'Solicitado por', value: `<@${t.requester}>`, inline: true },
      { name: 'Na fila', value: `${queue.size()} faixas`, inline: true },
      { name: 'Canal', value: `<#${queue.voiceChannelId}>`, inline: true }
    )
    .setFooter({ text: queue.paused ? '⏸️ Pausado' : '▶️ Tocando' })
    .setTimestamp();

  if (t.spotifyUrl) embed.setURL(t.spotifyUrl);

  await interaction.editReply({ embeds: [embed] });
}

// alias np
export default { data, execute };
