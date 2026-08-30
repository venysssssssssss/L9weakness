const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('limparbot')
		.setDescription('Apaga as mensagens recentes enviadas por mim (o bot).'),
	async execute(interaction) {
		try {
			// Responde apenas para quem usou o comando (ephemeral) para não poluir o chat
			await interaction.deferReply({ flags: 64 });

			console.log('[LimparBot] Buscando mensagens do bot...');
			
			// Busca as últimas 100 mensagens do canal
			const messages = await interaction.channel.messages.fetch({ limit: 100 });
			
			if (!messages || messages.size === 0) {
				await interaction.editReply('Nenhuma mensagem encontrada no canal.');
				return;
			}

			// Filtra apenas as mensagens enviadas por este bot
			const botMessages = messages.filter(msg => msg.author && msg.author.id === interaction.client.user.id);

			console.log(`[LimparBot] Mensagens do bot encontradas: ${botMessages.size}`);

			if (botMessages.size === 0) {
				await interaction.editReply('Não encontrei mensagens minhas recentes para apagar.');
				return;
			}

			// Apaga as mensagens (o 'true' ignora erros de mensagens com mais de 14 dias)
			await interaction.channel.bulkDelete(botMessages, true);
			console.log(`[LimparBot] ${botMessages.size} mensagens deletadas com sucesso`);

			await interaction.editReply(`✅ Sucesso! Apaguei **${botMessages.size}** mensagens enviadas por mim.`);
		} catch (error) {
			console.error('[LimparBot] Erro ao apagar mensagens:', error);
			try {
				await interaction.editReply(`❌ Erro ao tentar apagar as mensagens: ${error.message.substring(0, 100)}`);
			} catch (e) {
				console.error('[LimparBot] Erro ao enviar mensagem de erro:', e);
				await interaction.editReply('❌ Erro crítico. Verifique se tenho permissão de "Gerenciar Mensagens".');
			}
		}
	},
};
