const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getConfig } = require('../../utils/ai/config');
const { vision } = require('../../utils/ai/nvidiaClient');
const { SHERLOCK_SYSTEM } = require('../../utils/ai/prompts');
const { visionLimiter } = require('../../utils/ai/rateLimiter');
const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

module.exports = {
	data: new SlashCommandBuilder()
		.setName('sherlock')
		.setDescription('Envie uma foto e eu deduzirei tudo sobre você (NVIDIA 90B Vision).')
        .addAttachmentOption(option =>
            option.setName('evidencia')
                .setDescription('A foto (cena do crime, seu quarto, sua mesa, etc.)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('pergunta')
                .setDescription('Uma pergunta específica para o detetive (opcional)')
                .setRequired(false)),
	async execute(interaction) {
		await interaction.deferReply();

		try {
			// Validar API Key
			const cfg = getConfig();
			if (!cfg.apiKey) {
				console.error('[Sherlock] NVIDIA_API_KEY não configurada');
				await interaction.editReply('❌ Erro: NVIDIA_API_KEY não está configurada. Gere em https://build.nvidia.com');
				return;
			}

			// === Rate limits para proteger créditos 90B ===
			const userKey = `sherlock:user:${interaction.user.id}`;
			const channelKey = `sherlock:channel:${interaction.channelId}`;
			const dailyKey = `sherlock:daily:${interaction.guildId || 'dm'}`;

			const cdUser = visionLimiter.peekCooldown(userKey, cfg.visionCooldownSec);
			if (cdUser > 0) {
				await interaction.editReply(`⏳ Calma, detetive! Você já usou o Sherlock há pouco. Tente em **${cdUser}s** (limite para economizar créditos 90B).`);
				return;
			}
			const cdChan = visionLimiter.peekCooldown(channelKey, 30);
			if (cdChan > 0) {
				await interaction.editReply(`⏳ O Sherlock está examinando outra evidência neste canal. Tente em **${cdChan}s**.`);
				return;
			}
			const daily = visionLimiter.checkDaily(dailyKey, cfg.visionDailyLimit);
			if (!daily.allowed) {
				await interaction.editReply(`🚫 Limite diário do Sherlock atingido (**${daily.limit}/dia** por servidor). Volta amanhã! (proteção de créditos 90B)`);
				// revert increment? we already incremented, need to keep it blocked
				return;
			}
			// consume cooldowns only after checks pass (peek first, then set)
			visionLimiter.checkCooldown(userKey, cfg.visionCooldownSec);
			visionLimiter.checkCooldown(channelKey, 30);
			console.log(`[Sherlock] Rate OK — daily ${daily.current}/${daily.limit} — user ${interaction.user.id}`);

			// 2. Pegar a imagem
			const imageAttachment = interaction.options.getAttachment('evidencia');
			const userQuestion = interaction.options.getString('pergunta');
			
			if (!imageAttachment) {
				await interaction.editReply('❌ Erro: Nenhuma imagem foi fornecida.');
				return;
			}

			// Validar se é imagem
			if (!imageAttachment.contentType || !imageAttachment.contentType.startsWith('image/')) {
				console.warn('[Sherlock] Arquivo não é uma imagem válida:', imageAttachment.contentType);
				return interaction.editReply('❌ Isso não parece ser uma imagem válida, meu caro Watson. Preciso de provas visuais (JPG, PNG).');
			}

			// Limite de tamanho para proteger créditos / payload
			const MAX_BYTES = 3 * 1024 * 1024; // 3MB
			if (imageAttachment.size > MAX_BYTES) {
				await interaction.editReply(`❌ Imagem muito grande (**${(imageAttachment.size/1024/1024).toFixed(2)}MB**). Envie até **3MB** para o 90B Vision (limite de créditos).`);
				return;
			}
			if (imageAttachment.size > 2 * 1024 * 1024) {
				console.warn(`[Sherlock] Imagem grande ${imageAttachment.size} bytes — enviando mesmo assim (aviso)`);
			}

			console.log(`[Sherlock] Analisando imagem para dedução... Tamanho: ${imageAttachment.size} bytes | Modelo: ${cfg.visionModel}`);

			// Cache por URL (evita re-analisar mesma imagem)
			const cacheKey = crypto.createHash('sha256').update(imageAttachment.url + '|' + (userQuestion || '')).digest('hex').slice(0, 16);
			const cached = visionLimiter.getCache(cacheKey);
			if (cached) {
				console.log(`[Sherlock] Cache HIT ${cacheKey}`);
				const embed = new EmbedBuilder()
					.setTitle('🔍 Dedução de Sherlock (cache)')
					.setDescription(cached.length > 4096 ? cached.substring(0, 4093) + '...' : cached)
					.setColor(0x2B2D31)
					.setImage(imageAttachment.url)
					.setFooter({ text: `Análise via NVIDIA ${cfg.visionModel} • cache`, iconURL: interaction.client.user.displayAvatarURL() });
				await interaction.editReply({ embeds: [embed] });
				return;
			}

			// 3. Baixar a imagem e converter para base64
			const response = await fetch(imageAttachment.url);
			if (!response.ok) {
				throw new Error(`Falha ao baixar imagem: ${response.statusText}`);
			}

			const arrayBuffer = await response.arrayBuffer();
			const buffer = Buffer.from(arrayBuffer);
			
			// Se imagem >2MB, poderíamos downscale com canvas, mas por ora enviamos direto (limite 3MB já protege)
			const base64 = buffer.toString('base64');

			// 4. Criar o Prompt
			let promptText = SHERLOCK_SYSTEM;
			if (userQuestion) {
				promptText += `\nAlém disso, responda a esta pergunta específica do usuário sobre a imagem: "${userQuestion}"`;
			}

			// 5. Gerar o conteúdo via NVIDIA
			console.log('[Sherlock] Gerando dedução com NVIDIA Vision...');
			const text = await vision(promptText, base64, imageAttachment.contentType);

			if (!text) {
				throw new Error('Resposta vazia da IA');
			}

			console.log('[Sherlock] Dedução gerada com sucesso!');
			visionLimiter.setCache(cacheKey, text);

			// 6. Enviar a resposta formatada
			const embed = new EmbedBuilder()
				.setTitle('🔍 Dedução de Sherlock')
				.setDescription(text.length > 4096 ? text.substring(0, 4093) + '...' : text)
				.setColor(0x2B2D31)
				.setImage(imageAttachment.url)
				.setFooter({ text: `Análise via NVIDIA ${cfg.visionModel}`, iconURL: interaction.client.user.displayAvatarURL() });

			await interaction.editReply({ embeds: [embed] });

		} catch (error) {
			console.error('[Sherlock] Erro na dedução:', error);
			let errorMsg = '❌ **Erro na dedução:** Minha mente palácio está nebulosa hoje.';
			
			if (error.status === 401 || error.status === 403) {
				errorMsg = '❌ **NVIDIA auth falhou (401/403).** Verifique sua `NVIDIA_API_KEY` em https://build.nvidia.com';
			} else if (error.message && error.message.includes('429')) {
				errorMsg += ' (Créditos/limite NVIDIA atingido — aguarde 1min).';
			} else if (error.message && error.message.includes('413')) {
				errorMsg += ' (Imagem muito grande para o modelo 90B).';
			} else if (error.status === 404) {
				errorMsg += ` (Modelo ${getConfig().visionModel} não encontrado na sua conta NVIDIA).`;
			} else if (error.message) {
				errorMsg += ` (${error.message.substring(0, 80)})`;
			}
			
			try {
				await interaction.editReply(errorMsg);
			} catch (e) {
				console.error('[Sherlock] Erro ao enviar mensagem de erro:', e);
				await interaction.editReply('❌ Erro crítico na dedução. Contate o administrador.');
			}
		}
	},
};
