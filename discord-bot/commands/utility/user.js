const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('user')
		.setDescription('Fornece informações sobre o usuário.'),
	async execute(interaction) {
		try {
			const user = interaction.user;
			const member = interaction.member;
			
			if (!user || !member) {
				await interaction.reply({ content: '❌ Erro: Usuário ou membro não encontrado.', flags: 64 });
				return;
			}

			console.log(`[User] Informações do usuário: ${user.username} (ID: ${user.id})`);
			await interaction.reply(`Este comando foi executado por ${user.username}, que entrou em ${member.joinedAt}.`);
		} catch (error) {
			console.error('[User] Erro ao executar:', error);
			try {
				await interaction.reply({ content: '❌ Erro ao buscar informações do usuário!', flags: 64 });
			} catch (e) {
				console.error('[User] Erro ao enviar mensagem de erro:', e);
			}
		}
	},
};
