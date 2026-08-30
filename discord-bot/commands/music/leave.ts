import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { queueManager } from '../../utils/music/QueueManager';

export const data = new SlashCommandBuilder()
  .setName('leave')
  .setDescription('Sai do canal de voz e limpa a fila');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const queue = queueManager.get(interaction.guildId!);
  if (!queue || !queue.connection) {
    await interaction.editReply('❌ Não estou em nenhum canal de voz.');
    return;
  }
  const ch = queue.voiceChannelId;
  queueManager.delete(interaction.guildId!);
  await interaction.editReply(`👋 Saí do canal <#${ch}> e limpei a fila.`);
}

export default { data, execute };
