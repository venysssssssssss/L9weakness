const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getConfig } = require('../../utils/ai/config');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('models')
		.setDescription('Lista os modelos NVIDIA BUILD configurados.'),
	async execute(interaction) {
        await interaction.deferReply();

        const cfg = getConfig();
        const models = [
            { name: cfg.textModel, desc: 'Texto rápido, multimodal — usado em SimSimi + parser tempo. Baixo custo/latência.', status: '✅ Ativo (8B)' },
            { name: cfg.visionModel, desc: '90B Vision — Sherlock. Alto custo, deduções detalhadas. Cooldown 45s.', status: '✅ Ativo (90B Vision)' },
            { name: cfg.imageModel, desc: `Imagem SDXL Turbo — Imaginar (${cfg.imageSize}). Cooldown ${cfg.imageCooldownSec}s.`, status: '✅ Ativo (SDXL)' },
        ];

        const embed = new EmbedBuilder()
            .setTitle('🧠 Modelos NVIDIA BUILD')
            .setColor(0x76B900)
            .setDescription(`Base: \`${cfg.baseUrl}\`\nLimites: Vision ${cfg.visionDailyLimit}/dia • Imagem ${cfg.imageDailyLimit}/dia`)
            .setTimestamp()
            .setFooter({ text: 'L9 Weakness • NVIDIA BUILD' });

        models.forEach(m => {
            embed.addFields({ name: m.name, value: `${m.status}\n${m.desc}`, inline: false });
        });

        if (!cfg.apiKey) {
            embed.addFields({ name: '⚠️ NVIDIA_API_KEY', value: 'Não configurada! Gere em https://build.nvidia.com', inline: false });
            embed.setColor(0xFF0000);
        }

        await interaction.editReply({ embeds: [embed] });
	},
};
