const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('ping')
		.setDescription('Responde com a latência do bot!'),
	async execute(interaction) {
		try {
			console.log('[Ping] Calculando latência...');
			await interaction.reply({ content: 'Calculando Ping...' });
			const sent = await interaction.fetchReply();
			const latencia = sent.createdTimestamp - interaction.createdTimestamp;
			const apiPing = Math.round(interaction.client.ws.ping);
			
			console.log(`[Ping] Latência do Bot: ${latencia}ms | API: ${apiPing}ms`);
			await interaction.editReply(`🏓 Pong!\nLatência do Bot: **${latencia}ms**\nLatência da API: **${apiPing}ms**`);
		} catch (error) {
			console.error('[Ping] Erro ao calcular ping:', error);
			try {
				await interaction.reply({ content: '❌ Erro ao calcular ping!', flags: 64 });
			} catch (e) {
				console.error('[Ping] Erro ao enviar mensagem de erro:', e);
			}
		}
	},
};
