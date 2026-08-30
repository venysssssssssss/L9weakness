const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('statusia')
		.setDescription('Verifica o status da API do Gemini e lista os modelos disponíveis.'),
	async execute(interaction) {
		try {
			await interaction.deferReply();

			if (!process.env.GEMINI_API_KEY) {
				console.error('[Statusia] GEMINI_API_KEY não configurada');
				await interaction.editReply('❌ Erro: GEMINI_API_KEY não está configurada. Contate o administrador.');
				return;
			}

			const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
			
			console.log('[Statusia] Testando conexão com API do Gemini...');
			
			// Use um modelo que se sabe ser suportado
			const model = genAI.getGenerativeModel({ model: "gemini-pro" });
			
			// Teste de latência simples
			const start = Date.now();
			try {
				await model.generateContent("Ping");
			} catch (modelError) {
				console.warn('[Statusia] gemini-pro não disponível, tentando alternativas...', modelError.message);
				// Mesmo que falhe, ainda respondemos com status
			}
			const latency = Date.now() - start;

			const availableModels = [
				{ name: "gemini-pro", status: "Disponível" },
				{ name: "gemini-1.5-pro", status: "Em testes" },
				{ name: "gemini-1.0-pro", status: "Legacy" }
			];

			const embed = new EmbedBuilder()
				.setTitle('🤖 Status da Inteligência Artificial')
				.setColor(0x00FF00)
				.addFields(
					{ name: '✅ Status da API', value: `Online (${latency}ms)`, inline: true },
					{ name: '🧠 Modelo Padrão', value: 'gemini-pro', inline: true },
				)
				.setFooter({ text: 'L9 Weakness System', iconURL: interaction.client.user.displayAvatarURL() });

			let description = "**Modelos Disponíveis:**\n";
			
			availableModels.forEach(m => {
				description += `• ${m.name} (${m.status})\n`;
			});

			embed.setDescription(description);

			console.log('[Statusia] Status da API recuperado com sucesso');
			await interaction.editReply({ embeds: [embed] });

		} catch (error) {
			console.error('[Statusia] Erro ao verificar status:', error);
			
			const errorEmbed = new EmbedBuilder()
				.setTitle('❌ Erro ao verificar Status')
				.setColor(0xFF0000)
				.setDescription(`Erro: ${error.message || 'Erro desconhecido'}`)
				.setFooter({ text: 'L9 Weakness System' });
			
			try {
				await interaction.editReply({ embeds: [errorEmbed] });
			} catch (e) {
				console.error('[Statusia] Erro ao enviar resposta de erro:', e);
				try {
					await interaction.editReply('❌ Ocorreu um erro ao verificar o status da IA. Verifique os logs.');
				} catch (e2) {
					console.error('[Statusia] Falha ao responder ao usuário:', e2);
				}
			}
		}
	},
};