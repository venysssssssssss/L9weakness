import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { queueManager } from '../../utils/music/QueueManager';

export const data = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('Para a música e limpa a fila');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const queue = queueManager.get(interaction.guildId!);
  if (!queue || (!queue.current && queue.size() === 0)) {
    await interaction.editReply('❌ Nada tocando para parar.');
    return;
  }
  queue.stop(true);
  await interaction.editReply('⏹️ Parei a música e limpei a fila. Sairei do canal em 5 min ou use `/leave`.');
}

export default { data, execute };
