import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getLearningStorage } from '../../utils/learning/Storage';
import { WillManager } from '../../utils/learning/Will';
import { getOrchestrator } from '../../utils/learning/Orchestrator';

export const data = new SlashCommandBuilder()
  .setName('learning')
  .setDescription('Gerencia o sistema de aprendizado autônomo 1h/dia do bot')
  .addSubcommand(sc => sc.setName('status').setDescription('Mostra status do aprendizado e vontade'))
  .addSubcommand(sc => sc.setName('will').setDescription('Mostra a vontade própria atual do bot'))
  .addSubcommand(sc => sc.setName('history').setDescription('Mostra últimos aprendizados').addIntegerOption(o => o.setName('limite').setDescription('Quantos itens').setRequired(false)))
  .addSubcommand(sc => sc.setName('trigger').setDescription('Dispara aprendizado manual (admin)').addIntegerOption(o => o.setName('minutos').setDescription('Duração em minutos (1-60)').setRequired(false)))
  .addSubcommand(sc => sc.setName('stop').setDescription('Para aprendizado em andamento (admin)'));

export async function execute(interaction: any) {
  const sub = interaction.options.getSubcommand();
  const storage = getLearningStorage();
  const willMgr = new WillManager();
  const orch = getOrchestrator();

  await interaction.deferReply({ ephemeral: sub === 'trigger' || sub === 'stop' });

  try {
    if (sub === 'status') {
      const stats = storage.getStats();
      const will = willMgr.getCurrent();
      const reflections = storage.getRecentReflections(3);
      const isActive = orch.isActive();

      const embed = new EmbedBuilder()
        .setTitle(isActive ? '🧠 Aprendendo agora (1h/dia)' : '🧠 Aprendizado Autônomo')
        .setColor(isActive ? 0x00FF00 : 0x76B900)
        .setDescription(
          `**Status:** ${isActive ? '🔴 Em execução (consome internet)' : '🟢 Agendado diariamente'}\n` +
          `**Agendamento:** Todo dia às \`${process.env.LEARNING_START_HOUR || 3}:${String(process.env.LEARNING_START_MINUTE || 0).padStart(2,'0')} UTC\` por \`${process.env.LEARNING_DURATION_MIN || 60}min\`\n` +
          `**Modelo:** \`${process.env.NVIDIA_TEXT_MODEL || 'openai/gpt-oss-20b'}\` • **Vontade v${will.version}**\n\n` +
          `**Conhecimento:** ${stats.total} páginas • Hoje: ${stats.today} • Últimos 7d: ${stats.last7} • Streak: ${will.daily_streak} dias\n` +
          `**Curiosidades:** ${will.curiosity.join(', ')}\n` +
          `**Última reflexão:** ${reflections[0]?.summary.slice(0,300) || will.learned_summary.slice(0,300)}`
        )
        .setFooter({ text: `L9 Weakness • Vontade própria ${will.daily_streak} dias` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (sub === 'will') {
      const embed = new EmbedBuilder()
        .setTitle('💭 Vontade Própria do L9')
        .setColor(0x9B59B6)
        .setDescription(willMgr.formatForDiscord())
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (sub === 'history') {
      const limite = interaction.options.getInteger('limite') || 5;
      const recent = storage.getRecentKnowledge(Math.min(limite, 10));
      if (recent.length === 0) {
        await interaction.editReply('📭 Ainda não há conhecimento armazenado. O bot começa a aprender às 03:00 UTC por 1h.');
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle(`📚 Últimos ${recent.length} aprendizados`)
        .setColor(0x0099FF)
        .setTimestamp();
      recent.forEach((k, i) => {
        embed.addFields({
          name: `${i+1}. ${k.topic} (${k.day})`,
          value: `${k.summary.slice(0,250)}...\n[fonte](${k.source_url})`,
          inline: false,
        });
      });
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (sub === 'trigger') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.editReply('❌ Apenas administradores podem disparar aprendizado manual.');
        return;
      }
      const minutos = interaction.options.getInteger('minutos') || 5;
      if (orch.isActive()) {
        await interaction.editReply('⏳ Já está aprendendo! Use `/learning status` para ver.');
        return;
      }
      await interaction.editReply(`🚀 Disparando aprendizado manual de **${minutos}min**... Isso consome internet e créditos NVIDIA. Acompanhe com \`/learning status\` e veja logs.`);
      // Run async without blocking reply
      setTimeout(async () => {
        try {
          await orch.runForDuration(Math.min(minutos, 60));
          console.log('[Learning] Manual trigger concluído');
        } catch (e: any) {
          console.error('[Learning] Manual erro:', e.message);
        }
      }, 1000);
      return;
    }

    if (sub === 'stop') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.editReply('❌ Apenas administradores.');
        return;
      }
      if (!orch.isActive()) {
        await interaction.editReply('ℹ️ Nenhum aprendizado em andamento.');
        return;
      }
      orch.stop();
      await interaction.editReply('🛑 Aprendizado abortado.');
      return;
    }
  } catch (e: any) {
    console.error('[Learning cmd] Erro:', e);
    await interaction.editReply(`❌ Erro: ${e.message.slice(0,200)}`);
  }
}
