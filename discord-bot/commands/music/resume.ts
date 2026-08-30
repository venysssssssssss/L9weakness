import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { queueManager } from '../../utils/music/QueueManager';

export const data = new SlashCommandBuilder()
  .setName('resume')
  .setDescription('Retoma a música pausada');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const queue = queueManager.get(interaction.guildId!);
  if (!queue || !queue.current) {
    await interaction.editReply('❌ Nada pausado.');
    return;
  }
  if (queue.resume()) await interaction.editReply(`▶️ Retomado: **${queue.current.title}**`);
  else await interaction.editReply('❌ Não está pausado.');
}

export default { data, execute };
