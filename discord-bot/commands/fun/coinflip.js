const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('coinflip')
		.setDescription('Joga uma moeda (Cara ou Coroa)!'),
	async execute(interaction) {
		try {
			const resultado = Math.random() < 0.5 ? 'Cara' : 'Coroa';
			console.log(`[CoinFlip] Resultado: ${resultado}`);
			await interaction.reply(`🪙 A moeda caiu em: **${resultado}**!`);
		} catch (error) {
			console.error('[CoinFlip] Erro ao executar:', error);
			try {
				await interaction.reply({ content: '❌ Erro ao jogar a moeda!', flags: 64 });
			} catch (e) {
				console.error('[CoinFlip] Erro ao enviar mensagem de erro:', e);
			}
		}
	},
};
