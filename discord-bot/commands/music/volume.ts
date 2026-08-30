import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { queueManager } from '../../utils/music/QueueManager';

export const data = new SlashCommandBuilder()
  .setName('volume')
  .setDescription('Ajusta o volume (0-200%)')
  .addIntegerOption((o) => o.setName('nivel').setDescription('0 a 200').setRequired(true).setMinValue(0).setMaxValue(200));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const vol = interaction.options.getInteger('nivel', true);
  const queue = queueManager.get(interaction.guildId!);
  if (!queue || !queue.current) {
    await interaction.editReply('❌ Nada tocando.');
    return;
  }
  queue.setVolume(vol);
  await interaction.editReply(`🔊 Volume: **${vol}%**`);
}

export default { data, execute };
