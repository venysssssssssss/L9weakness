import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { queueManager } from '../../utils/music/QueueManager';

export const data = new SlashCommandBuilder()
  .setName('shuffle')
  .setDescription('Embaralha a fila');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const queue = queueManager.get(interaction.guildId!);
  if (!queue || queue.size() < 2) {
    await interaction.editReply('❌ Fila muito curta para embaralhar.');
    return;
  }
  queue.shuffle();
  await interaction.editReply(`🔀 Fila embaralhada! ${queue.size()} faixas.`);
}

export default { data, execute };
