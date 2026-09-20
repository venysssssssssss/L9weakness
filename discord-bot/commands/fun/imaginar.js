const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { getConfig } = require('../../utils/ai/config');
const { generateImage } = require('../../utils/ai/nvidiaClient');
const { imageLimiter } = require('../../utils/ai/rateLimiter');

// FLUX accepts multiples of 16 up to ~1.4 MP; these three cover the useful cases.
const SIZES = { quadrado: [1024, 1024], paisagem: [1344, 768], retrato: [768, 1344] };

module.exports = {
	data: new SlashCommandBuilder()
		.setName('imaginar')
		.setDescription('Gera uma imagem com FLUX.2 (NVIDIA Build)')
		.addStringOption(option =>
			option.setName('descricao')
				.setDescription('Descreva o que você quer ver (ex: Gato astronauta em Marte, cinematográfico)')
				.setRequired(true))
		.addStringOption(option =>
			option.setName('formato')
				.setDescription('Proporção da imagem')
				.addChoices(
					{ name: 'Quadrado 1024x1024', value: 'quadrado' },
					{ name: 'Paisagem 1344x768', value: 'paisagem' },
					{ name: 'Retrato 768x1344', value: 'retrato' },
				)),
	async execute(interaction) {
		try {
			await interaction.deferReply();
			const prompt = (interaction.options.getString('descricao') || '').trim().slice(0, 800);
			if (!prompt) return interaction.editReply('❌ Erro: Descrição não foi fornecida.');

			const cfg = getConfig();
			if (!cfg.apiKey) return interaction.editReply('❌ NVIDIA_API_KEY não configurada. Gere em https://build.nvidia.com');

			const userKey = `imaginar:user:${interaction.user.id}`;
			const guildKey = `imaginar:daily:${interaction.guildId || 'dm'}`;
			const channelKey = `imaginar:channel:${interaction.channelId}`;
			const cdUser = imageLimiter.peekCooldown(userKey, cfg.imageCooldownSec);
			if (cdUser > 0) return interaction.editReply(`⏳ Calma, artista! Tente em **${cdUser}s** (limite ${cfg.imageCooldownSec}s para economizar créditos).`);
			const cdChannel = imageLimiter.peekCooldown(channelKey, 8);
			if (cdChannel > 0) return interaction.editReply(`⏳ Estúdio ocupado neste canal. Tente em **${cdChannel}s**.`);
			const daily = imageLimiter.checkDaily(guildKey, cfg.imageDailyLimit);
			if (!daily.allowed) return interaction.editReply(`🚫 Limite diário de imagens atingido (**${daily.limit}/dia** por servidor). Volta amanhã!`);
			imageLimiter.checkCooldown(userKey, cfg.imageCooldownSec);
			imageLimiter.checkCooldown(channelKey, 8);

			const [width, height] = SIZES[interaction.options.getString('formato')] || SIZES.quadrado;
			const seed = Math.floor(Math.random() * 1000000);
			console.log(`[Imaginar] ${cfg.imageModel} ${width}x${height} seed=${seed} daily ${daily.current}/${daily.limit} user ${interaction.user.id}`);

			const buffer = await generateImage(prompt, { width, height, seed });
			if (!buffer || buffer.length < 1000) throw new Error('Buffer de imagem vazio');

			const attachment = new AttachmentBuilder(buffer, { name: 'arte_nvidia.jpg' });
			const embed = new EmbedBuilder()
				.setTitle('🎨 Estúdio NVIDIA • FLUX')
				.setDescription(`**Tema:** *"${prompt}"*\n**Modelo:** \`${cfg.imageModel}\` • **${width}x${height}**`)
				.setImage('attachment://arte_nvidia.jpg')
				.setColor(0x76B900)
				.setFooter({ text: `Gerado para ${interaction.user.username} • Seed: ${seed} • ${daily.current}/${daily.limit} hoje`, iconURL: interaction.user.displayAvatarURL() })
				.setTimestamp();
			await interaction.editReply({ embeds: [embed], files: [attachment] });
			console.log(`[Imaginar] OK ${buffer.length} bytes`);
		} catch (error) {
			console.error('[Imaginar] Erro:', error.message);
			let msg = '❌ Erro ao gerar a imagem.';
			if (error.status === 401 || error.status === 403) msg = '❌ **NVIDIA auth falhou (401/403).** Verifique sua `NVIDIA_API_KEY` em https://build.nvidia.com';
			else if (error.status === 429) msg = '⏳ **Estúdio lotado (429)** — créditos NVIDIA temporariamente esgotados. Tente em 1 minuto.';
			else if (error.status === 404) msg = `❌ Modelo \`${getConfig().imageModel}\` não disponível na sua conta NVIDIA.`;
			else if (error.status === 422) msg = `❌ Pedido rejeitado pelo modelo (422): ${String(error.message).slice(0, 120)}`;
			else if (error.message) msg += ` (${error.message.substring(0, 100)})`;
			try { await interaction.editReply({ content: msg }); } catch (e) { console.error('[Imaginar] Erro ao responder:', e.message); }
		}
	},
};
