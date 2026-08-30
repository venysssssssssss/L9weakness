import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { queueManager } from '../../utils/music/QueueManager';

export const data = new SlashCommandBuilder()
  .setName('skip')
  .setDescription('Pula para a próxima música da fila');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const queue = queueManager.get(interaction.guildId!);
  if (!queue || (!queue.current && queue.size() === 0)) {
    await interaction.editReply('❌ Não há música tocando.');
    return;
  }

  const current = queue.current?.title || 'Desconhecida';
  const ok = queue.skip();
  if (ok) {
    const next = queue.current ? queue.current.title : queue.getQueue()[0]?.title || 'fila vazia - saindo em 5min';
    // skip triggers Idle -> next, but current still old at this moment due async
    await interaction.editReply(`⏭️ Pulei **${current}**${queue.getQueue().length > 0 || queue.current ? '' : ' (fila vazia)'}`);
  } else {
    await interaction.editReply('❌ Falha ao pular.');
  }
}

export default { data, execute };
