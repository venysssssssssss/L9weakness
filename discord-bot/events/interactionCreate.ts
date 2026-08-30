import { Events, Interaction } from 'discord.js';

export default {
	name: Events.InteractionCreate,
	async execute(interaction: Interaction) {
		try {
			if (!interaction.isChatInputCommand()) return;

			const command = interaction.client.commands.get(interaction.commandName);

			if (!command) {
				console.error(`[InteractionCreate] Nenhum comando correspondente a ${interaction.commandName} foi encontrado.`);
				return;
			}

			console.log(`[InteractionCreate] Executando comando: ${interaction.commandName} pelo usuário ${interaction.user.id}`);
			await command.execute(interaction);
		} catch (error) {
			console.error('[InteractionCreate] Erro ao executar comando:', error);
			try {
				if (interaction.isChatInputCommand()) {
					if (interaction.replied || interaction.deferred) {
						await interaction.followUp({ content: 'Houve um erro ao executar este comando!', flags: 64 });
					} else {
						await interaction.reply({ content: 'Houve um erro ao executar este comando!', flags: 64 });
					}
				}
			} catch (e) {
				console.error('[InteractionCreate] Erro ao enviar mensagem de erro:', e);
			}
		}
	},
};
