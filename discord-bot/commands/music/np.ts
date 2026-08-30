import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { queueManager } from '../../utils/music/QueueManager';

// Alias for nowplaying
export const data = new SlashCommandBuilder()
  .setName('np')
  .setDescription('Alias: mostra a música tocando agora');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const queue = queueManager.get(interaction.guildId!);
  if (!queue || !queue.current) {
    await interaction.editReply('🔇 Nada tocando agora.');
    return;
  }
  const t = queue.current;
  const embed = new EmbedBuilder()
    .setTitle('🎧 Tocando agora (np)')
    .setDescription(`**[${t.title}](${t.url})**\n\`${t.durationFormatted}\` • ${t.channel || ''}`)
    .setThumbnail(t.thumbnail)
    .setColor(0x1db954)
    .setFooter({ text: queue.paused ? '⏸️ Pausado' : '▶️ Tocando' })
    .setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}

export default { data, execute };
