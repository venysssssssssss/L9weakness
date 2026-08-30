const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('8ball')
		.setDescription('Faça uma pergunta para a bola mágica 8')
        .addStringOption(option => 
            option.setName('pergunta')
                .setDescription('A pergunta que você quer fazer')
                .setRequired(true)),
	async execute(interaction) {
		try {
			const respostas = [
				"É certo.", "É decididamente assim.", "Sem dúvida.", "Sim, definitivamente.",
				"Você pode contar com isso.", "A meu ver, sim.", "Provavelmente.", "Boas perspectivas.",
				"Sim.", "Os sinais apontam que sim.", "Resposta nebulosa, tente de novo.", "Pergunte novamente mais tarde.",
				"Melhor não te dizer agora.", "Não consigo prever agora.", "Concentre-se e pergunte novamente.",
				"Não conte com isso.", "Minha resposta é não.", "Minhas fontes dizem não.",
				"Perspectivas não são tão boas.", "Muito duvidoso."
			];
			
			const pergunta = interaction.options.getString('pergunta');
			if (!pergunta) {
				await interaction.reply('❌ Erro: Nenhuma pergunta foi fornecida.');
				return;
			}

			const resposta = respostas[Math.floor(Math.random() * respostas.length)];
			console.log(`[8Ball] Pergunta: "${pergunta}" | Resposta: "${resposta}"`);
			
			await interaction.reply(`🎱 **Pergunta:** ${pergunta}\n**Resposta:** ${resposta}`);
		} catch (error) {
			console.error('[8Ball] Erro ao executar:', error);
			try {
				await interaction.reply({ content: '❌ Erro ao consultar a bola mágica!', flags: 64 });
			} catch (e) {
				console.error('[8Ball] Erro ao enviar mensagem de erro:', e);
			}
		}
	},
};
