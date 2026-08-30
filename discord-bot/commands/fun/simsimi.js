const { SlashCommandBuilder } = require('discord.js');
const simsimiState = require('../../simsimiState.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('simsimi')
		.setDescription('Ativa ou desativa o modo SimSimi (Zoeiro/Ácido) neste canal.')
        .addStringOption(option =>
            option.setName('modo')
                .setDescription('Ligar ou desligar?')
                .setRequired(true)
                .addChoices(
                    { name: 'Ligar (Cuidado!)', value: 'on' },
                    { name: 'Desligar', value: 'off' },
                )),
	async execute(interaction) {
		try {
			const modo = interaction.options.getString('modo');
			const channelId = interaction.channelId;

			if (!modo) {
				await interaction.reply('❌ Erro: Modo não foi especificado.');
				return;
			}

			if (modo === 'on') {
				simsimiState.add(channelId);
				console.log(`[SimSimi] Modo ATIVADO no canal ${channelId}`);
				await interaction.reply('🐔 **Modo SimSimi ATIVADO!**\nSe prepare, porque agora eu não tenho filtro. Pode mandar bala!');
			} else {
				simsimiState.remove(channelId);
				console.log(`[SimSimi] Modo DESATIVADO no canal ${channelId}`);
				await interaction.reply('🐔 **Modo SimSimi DESATIVADO.**\nVoltei a ser um bot educado e chato.');
			}
		} catch (error) {
			console.error('[SimSimi] Erro ao executar:', error);
			try {
				await interaction.reply({ content: '❌ Erro ao alternar modo SimSimi!', flags: 64 });
			} catch (e) {
				console.error('[SimSimi] Erro ao enviar mensagem de erro:', e);
			}
		}
	},
};
