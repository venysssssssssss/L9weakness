const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('models')
		.setDescription('Lista os modelos de IA disponíveis para uso.'),
	async execute(interaction) {
        await interaction.deferReply();

        // Lista manual baseada na documentação e logs recentes
        const models = [
            { name: 'gemini-2.5-flash', desc: 'Rápido, multimodal, ideal para chat.', status: '✅ Ativo (SimSimi)' },
            { name: 'gemini-2.5-flash-lite', desc: 'Versão leve, menor custo/quota.', status: '✅ Ativo (Fallback)' },
            { name: 'gemini-pro', desc: 'Modelo padrão de texto.', status: '⚠️ Legado' },
            { name: 'gemini-1.5-pro', desc: 'Maior janela de contexto.', status: '🧪 Disponível' },
            { name: 'gemma-3-1b', desc: 'Modelo aberto, leve.', status: '❓ Testar' }
        ];

        const embed = new EmbedBuilder()
            .setTitle('🧠 Modelos de IA Disponíveis')
            .setColor(0x0099FF)
            .setDescription('Aqui estão os modelos configurados ou conhecidos pelo bot:')
            .setTimestamp();

        models.forEach(m => {
            embed.addFields({ name: m.name, value: `${m.status}\n${m.desc}`, inline: true });
        });

        await interaction.editReply({ embeds: [embed] });
	},
};
