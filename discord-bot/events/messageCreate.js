const { Events } = require('discord.js');
const simsimiState = require('../simsimiState.js');
const { chat } = require('../utils/ai/nvidiaClient');
const { SIMSIMI_SYSTEM } = require('../utils/ai/prompts');
const { getConfig } = require('../utils/ai/config');

// Evitar spam: armazena timestamp da última mensagem por canal
const cooldowns = new Map();

module.exports = {
	name: Events.MessageCreate,
	async execute(message) {
		try {
			// Ignora mensagens de outros bots (e dele mesmo)
			if (message.author.bot) return;

			// Verifica se o modo SimSimi está ativo neste canal
			if (!simsimiState.has(message.channel.id)) return;

			// Verifica se tem conteúdo
			if (!message.content || message.content.trim().length === 0) {
				console.warn('[MessageCreate] Mensagem vazia recebida');
				return;
			}

			// Cooldown de 4 segundos para evitar Rate Limit no NVIDIA
			const now = Date.now();
			const lastMsg = cooldowns.get(message.channel.id) || 0;
			if (now - lastMsg < 4000) {
				console.log('[SimSimi] Cooldown ativo, ignorando mensagem');
				return;
			}
			cooldowns.set(message.channel.id, now);

			console.log(`[SimSimi] Respondendo a "${message.content.substring(0, 50)}..."`);

			try {
				await message.channel.sendTyping();
			} catch (e) {
				console.warn('[SimSimi] Erro ao enviar typing indicator:', e.message);
			}

			// Configura a IA NVIDIA
			const cfg = getConfig();
			if (!cfg.apiKey) {
				console.error('[SimSimi] NVIDIA_API_KEY não configurada');
				return;
			}

			// Limita tamanho da mensagem para economizar créditos
			const userMsg = message.content.slice(0, 300);

			console.log('[SimSimi] Gerando resposta com NVIDIA', cfg.textModel);
			const response = await chat({
				model: cfg.textModel,
				messages: [
					{ role: 'system', content: SIMSIMI_SYSTEM },
					{ role: 'user', content: userMsg },
				],
				temperature: 0.9,
				max_tokens: 500,
			});

			if (!response || response.trim().length === 0) {
				console.error('[SimSimi] Texto de resposta vazio');
				return;
			}

			console.log(`[SimSimi] Resposta: "${response.substring(0, 80)}..."`);
			await message.reply(response.slice(0, 1900));

		} catch (error) {
			// Rate limit (429) é esperado
			if (error.message && error.message.includes('429')) {
				console.warn('[SimSimi] Rate limit NVIDIA atingido, aguardando...');
				return;
			}
			
			if (error.status === 401 || error.status === 403) {
				console.warn('[SimSimi] NVIDIA auth falhou (401/403) — verifique NVIDIA_API_KEY');
				return;
			}

			console.error('[SimSimi] Erro ao processar mensagem:', error.message);
		}
	},
};
