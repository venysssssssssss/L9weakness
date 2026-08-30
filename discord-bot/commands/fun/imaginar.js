const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { getConfig, getImageDimensions } = require('../../utils/ai/config');
const { generateImage } = require('../../utils/ai/nvidiaClient');
const { IMAGINAR_NEGATIVE_PROMPT } = require('../../utils/ai/prompts');
const { imageLimiter } = require('../../utils/ai/rateLimiter');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('imaginar')
		.setDescription('Gera uma obra de arte única via NVIDIA SDXL Turbo!')
        .addStringOption(option => 
            option.setName('descricao')
                .setDescription('Descreva detalhadamente o que você quer ver (ex: Gato astronauta em Marte)')
                .setRequired(true)),
	async execute(interaction) {
		try {
			await interaction.deferReply();

			const prompt = interaction.options.getString('descricao');
			
			if (!prompt || prompt.trim().length === 0) {
				await interaction.editReply('❌ Erro: Descrição não foi fornecida.');
				return;
			}

			const cfg = getConfig();
			if (!cfg.apiKey) {
				console.error('[Imaginar] NVIDIA_API_KEY não configurada');
				await interaction.editReply('❌ Erro: NVIDIA_API_KEY não está configurada. Gere em https://build.nvidia.com');
				return;
			}

			// Rate limits para proteger créditos SDXL
			const userKey = `imaginar:user:${interaction.user.id}`;
			const guildKey = `imaginar:daily:${interaction.guildId || 'dm'}`;
			const channelKey = `imaginar:channel:${interaction.channelId}`;

			const cdUser = imageLimiter.peekCooldown(userKey, cfg.imageCooldownSec);
			if (cdUser > 0) {
				await interaction.editReply(`⏳ Calma, artista! Você gerou uma imagem há pouco. Tente em **${cdUser}s** (limite ${cfg.imageCooldownSec}s para economizar créditos).`);
				return;
			}
			const cdChannel = imageLimiter.peekCooldown(channelKey, 8);
			if (cdChannel > 0) {
				await interaction.editReply(`⏳ Estúdio ocupado neste canal. Tente em **${cdChannel}s**.`);
				return;
			}
			const daily = imageLimiter.checkDaily(guildKey, cfg.imageDailyLimit);
			if (!daily.allowed) {
				await interaction.editReply(`🚫 Limite diário de imagens atingido (**${daily.limit}/dia** por servidor). Volta amanhã!`);
				return;
			}
			imageLimiter.checkCooldown(userKey, cfg.imageCooldownSec);
			imageLimiter.checkCooldown(channelKey, 8);
			console.log(`[Imaginar] Rate OK — daily ${daily.current}/${daily.limit} — user ${interaction.user.id}`);

			// Limita prompt para economizar tokens
			const safePrompt = prompt.slice(0, 800);
			const { width, height } = getImageDimensions();
			const seed = Math.floor(Math.random() * 1000000);
			
			console.log(`[Imaginar] Gerando via NVIDIA ${cfg.imageModel} ${width}x${height} | Prompt: "${safePrompt.substring(0, 80)}..." | Seed: ${seed}`);
			
			// Gera via NVIDIA SDXL Turbo (com fallback pollinations se conta não tem image)
			let buffer;
			let usedFallback = false;
			let fallbackReason = '';
			try {
				buffer = await generateImage(safePrompt, {
					negative_prompt: IMAGINAR_NEGATIVE_PROMPT,
					width,
					height,
					seed,
				});
			} catch (e) {
				const isNotFound = e.status === 404 || (e.message && e.message.includes('Not found for account'));
				// Se NVIDIA falhar por modelo não encontrado ou 404, tentar tamanho menor como fallback interno antes do pollinations
				if (isNotFound && width > 512 && !e.message.includes('pollinations')) {
					console.warn(`[Imaginar] ${cfg.imageModel} 404 com ${width}x${height}, tentando 1024x1024`);
					try {
						buffer = await generateImage(safePrompt, {
							negative_prompt: IMAGINAR_NEGATIVE_PROMPT,
							width: 1024,
							height: 1024,
							seed,
						});
					} catch (e2) {
						// cai para fallback pollinations abaixo
						console.warn('[Imaginar] NVIDIA 404 mesmo com 1024, caindo para pollinations', e2.message);
						isNotFound && (fallbackReason = e2.message);
					}
				}
				if (!buffer) {
					if (isNotFound) {
						console.warn(`[Imaginar] NVIDIA image não disponível para esta conta (${e.message}), fallback para pollinations.ai`);
						usedFallback = true;
						fallbackReason = e.message;
						// Fallback pollinations.ai (grátis, sem crédito NVIDIA)
						const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(safePrompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true`;
						const res = await fetch(pollinationsUrl);
						if (!res.ok) throw new Error(`Pollinations fallback falhou: ${res.statusText}`);
						const arrayBuf = await res.arrayBuffer();
						buffer = Buffer.from(arrayBuf);
					} else {
						throw e;
					}
				}
			}

			if (!buffer || buffer.length < 1000) throw new Error('Buffer de imagem vazio');

			const attachment = new AttachmentBuilder(buffer, { name: usedFallback ? 'arte_pollinations.png' : 'arte_nvidia.png' });

			const arteEmbed = new EmbedBuilder()
				.setTitle(usedFallback ? '🎨 Estúdio de Arte (Pollinations • fallback)' : '🎨 Estúdio NVIDIA SDXL')
				.setDescription(`Aqui está sua imaginação trazida à vida!\n\n**Tema:** *"${safePrompt}"*\n**Modelo:** \`${usedFallback ? 'pollinations.ai (NVIDIA indisponível)' : cfg.imageModel}\` • **${width}x${height}**${usedFallback ? `\n*Nota: NVIDIA image 404 para esta conta, usado fallback gratuito. ${fallbackReason.slice(0,60)}*` : ''}`)
				.setImage(usedFallback ? 'attachment://arte_pollinations.png' : 'attachment://arte_nvidia.png')
				.setColor(usedFallback ? 0x9B59B6 : 0x76B900)
				.setFooter({ text: `Gerado para ${interaction.user.username} • Seed: ${seed} • ${daily.current}/${daily.limit} hoje`, iconURL: interaction.user.displayAvatarURL() })
				.setTimestamp();

			await interaction.editReply({ embeds: [arteEmbed], files: [attachment] });
			console.log(`[Imaginar] Imagem ${usedFallback ? 'pollinations fallback' : 'NVIDIA'} gerada com sucesso! ${buffer.length} bytes`);
		} catch (error) {
			console.error('[Imaginar] Erro ao executar:', error);
			let msg = '❌ Erro ao gerar a imagem.';
			if (error.status === 401 || error.status === 403) {
				msg = '❌ **NVIDIA auth falhou (401/403).** Verifique sua `NVIDIA_API_KEY` em https://build.nvidia.com';
			} else if (error.message && error.message.includes('429')) {
				msg = '⏳ **Estúdio lotado (429)** — créditos NVIDIA temporariamente esgotados. Tente em 1 minuto.';
			} else if (error.status === 413) {
				msg = '❌ Prompt ou imagem muito grande (413). Tente uma descrição mais curta.';
			} else if (error.status === 404) {
				msg = `❌ Modelo \`${getConfig().imageModel}\` não encontrado na sua conta NVIDIA. Verifique em build.nvidia.com`;
			} else if (error.message) {
				msg += ` (${error.message.substring(0, 100)})`;
			}
			try {
				await interaction.editReply({ content: msg });
			} catch (e) {
				console.error('[Imaginar] Erro ao enviar mensagem de erro:', e);
			}
		}
	},
};
