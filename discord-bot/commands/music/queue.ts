import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { queueManager } from '../../utils/music/QueueManager';

export const data = new SlashCommandBuilder()
  .setName('queue')
  .setDescription('Mostra a fila de músicas')
  .addIntegerOption((opt) => opt.setName('pagina').setDescription('Página (10 por página)').setRequired(false).setMinValue(1));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const queue = queueManager.get(interaction.guildId!);
  if (!queue || (!queue.current && queue.size() === 0)) {
    await interaction.editReply('📭 Fila vazia. Use `/play` para adicionar músicas.');
    return;
  }

  const page = interaction.options.getInteger('pagina') || 1;
  const perPage = 10;
  const allUpcoming = queue.getQueue();
  const totalPages = Math.max(1, Math.ceil(allUpcoming.length / perPage));
  const p = Math.min(page, totalPages);
  const start = (p - 1) * perPage;
  const slice = allUpcoming.slice(start, start + perPage);

  const embed = new EmbedBuilder()
    .setTitle('🎶 Fila de reprodução')
    .setColor(0x0099ff)
    .setTimestamp();

  let desc = '';

  if (queue.current) {
    desc += `**▶️ Tocando agora:** [${queue.current.title}](${queue.current.url}) \`${queue.current.durationFormatted}\` • <@${queue.current.requester}>\n\n`;
  }

  if (slice.length === 0) {
    desc += '_Nenhuma música na fila (apenas a atual)_';
  } else {
    desc += slice
      .map((t, i) => `**${start + i + 1}.** [${t.title}](${t.url}) \`${t.durationFormatted}\` • <@${t.requester}> ${t.source === 'spotify' ? '🟢' : '🔴'}`)
      .join('\n');
  }

  desc += `\n\n**Total na fila:** ${allUpcoming.length} (+ tocando) • **Página ${p}/${totalPages}**`;
  if (totalPages > 1) desc += `\nUse \`/queue pagina:${p < totalPages ? p + 1 : 1}\` para ver mais`;

  embed.setDescription(desc.length > 4000 ? desc.substring(0, 3997) + '...' : desc);

  if (queue.current?.thumbnail) embed.setThumbnail(queue.current.thumbnail);

  embed.setFooter({ text: `Solicite com /play • ${queue.size()} pendentes` });

  await interaction.editReply({ embeds: [embed] });
}

export default { data, execute };
