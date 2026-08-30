import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { queueManager } from '../../utils/music/QueueManager';

export const data = new SlashCommandBuilder()
  .setName('pause')
  .setDescription('Pausa a música atual');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const queue = queueManager.get(interaction.guildId!);
  if (!queue || !queue.current) {
    await interaction.editReply('❌ Nada tocando.');
    return;
  }
  if (queue.pause()) await interaction.editReply(`⏸️ Pausado: **${queue.current.title}** — use \`/resume\``);
  else await interaction.editReply('❌ Já está pausado ou não foi possível pausar.');
}

export default { data, execute };
