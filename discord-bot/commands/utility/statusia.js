const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getConfig } = require('../../utils/ai/config');
const { ping } = require('../../utils/ai/nvidiaClient');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('statusia')
		.setDescription('Verifica o status da API NVIDIA BUILD e lista os modelos.'),
	async execute(interaction) {
		try {
			await interaction.deferReply();

			const cfg = getConfig();
			if (!cfg.apiKey) {
				console.error('[StatusIA] NVIDIA_API_KEY não configurada');
				await interaction.editReply('❌ Erro: NVIDIA_API_KEY não está configurada. Gere em https://build.nvidia.com e coloque no .env');
				return;
			}

			console.log('[StatusIA] Testando conexão com NVIDIA BUILD...');
			
			const start = Date.now();
			let latency = -1;
			let apiOnline = false;
			let errorDetail = null;
			try {
				latency = await ping();
				apiOnline = true;
			} catch (e) {
				latency = Date.now() - start;
				errorDetail = e.message;
				console.warn('[StatusIA] ping falhou:', e.message);
				if (e.status === 401 || e.status === 403) {
					const embedErr = new EmbedBuilder()
						.setTitle('❌ NVIDIA Auth falhou')
						.setColor(0xFF0000)
						.setDescription(`401/403 — verifique sua NVIDIA_API_KEY em https://build.nvidia.com\n\`${e.message.substring(0,120)}\``);
					await interaction.editReply({ embeds: [embedErr] });
					return;
				}
			}

			const models = [
				{ name: cfg.textModel, desc: 'Texto rápido — SimSimi / parser tempo', status: apiOnline ? '✅ Ativo' : '⚠️ Erro' },
				{ name: cfg.visionModel, desc: '90B Vision — Sherlock', status: apiOnline ? '✅ Ativo' : '⚠️ Erro' },
				{ name: cfg.imageModel, desc: `Imagem — Imaginar (${cfg.imageSize})`, status: apiOnline ? '✅ Ativo' : '⚠️ Erro' },
			];

			const embed = new EmbedBuilder()
				.setTitle('🤖 Status NVIDIA BUILD')
				.setColor(apiOnline ? 0x76B900 : 0xFF0000)
				.addFields(
					{ name: apiOnline ? '✅ Status da API' : '❌ Status da API', value: apiOnline ? `Online (${latency}ms)` : `Offline (${errorDetail?.substring(0,80) || 'erro'})`, inline: true },
					{ name: '🧠 Texto', value: cfg.textModel, inline: true },
					{ name: '👁️ Vision', value: cfg.visionModel, inline: true },
					{ name: '🎨 Imagem', value: `${cfg.imageModel} (${cfg.imageSize})`, inline: true },
					{ name: '⏱️ Limites', value: `Vision: ${cfg.visionCooldownSec}s / ${cfg.visionDailyLimit}/dia\nImagem: ${cfg.imageCooldownSec}s / ${cfg.imageDailyLimit}/dia`, inline: false },
				)
				.setFooter({ text: 'L9 Weakness • NVIDIA BUILD', iconURL: interaction.client.user.displayAvatarURL() })
				.setTimestamp();

			let description = "**Modelos configurados:**\n";
			models.forEach(m => {
				description += `• \`${m.name}\` — ${m.status} — ${m.desc}\n`;
			});
			if (!apiOnline && errorDetail) description += `\n⚠️ \`${errorDetail.substring(0,120)}\``;

			embed.setDescription(description);

			console.log('[StatusIA] Status recuperado com sucesso');
			await interaction.editReply({ embeds: [embed] });

		} catch (error) {
			console.error('[StatusIA] Erro ao verificar status:', error);
			
			const errorEmbed = new EmbedBuilder()
				.setTitle('❌ Erro ao verificar Status NVIDIA')
				.setColor(0xFF0000)
				.setDescription(`Erro: ${error.message || 'Erro desconhecido'}`)
				.setFooter({ text: 'L9 Weakness System' });
			
			try {
				await interaction.editReply({ embeds: [errorEmbed] });
			} catch (e) {
				console.error('[StatusIA] Erro ao enviar resposta de erro:', e);
				try {
					await interaction.editReply('❌ Ocorreu um erro ao verificar o status NVIDIA. Verifique os logs.');
				} catch (e2) {
					console.error('[StatusIA] Falha ao responder ao usuário:', e2);
				}
			}
		}
	},
};
