import { SlashCommandBuilder } from 'discord.js';
import { todayEmbeds } from '../../utils/daily/commemorative';

export const data = new SlashCommandBuilder()
  .setName('hoje')
  .setDescription('Mostra todas as datas comemorativas de hoje');

export async function execute(interaction: any) {
  await interaction.deferReply();
  try {
    const embeds = await todayEmbeds();
    await interaction.editReply({ embeds: [embeds[0]] });
    for (const embed of embeds.slice(1)) await interaction.followUp({ embeds: [embed] });
  } catch (e: any) {
    await interaction.editReply(`❌ Não consegui buscar as datas de hoje (${e.message.slice(0, 100)})`);
  }
}
