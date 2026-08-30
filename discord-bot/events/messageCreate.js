const { Events } = require('discord.js');
const simsimiState = require('../simsimiState.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

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

			// Cooldown de 4 segundos para evitar Rate Limit (429) no plano gratuito
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

			// Configura a IA
			if (!process.env.GEMINI_API_KEY) {
				console.error('[SimSimi] GEMINI_API_KEY não configurada');
				return;
			}

			const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
			// Usando gemini-pro que é estável e suportado
			const model = genAI.getGenerativeModel({ model: "gemini-pro" });

			// Personalidade do SimSimi
			const prompt = `
				Você é o SimSimi.
				Sua personalidade é: Ácida, sarcástica, debochada, engraçada e levemente rude.
				Você usa gírias da internet brasileira (tipo "tankar", "cringe", "mó paz", etc).
				Suas respostas devem ser CURTAS (máximo 2 frases).
				Se o usuário falar algo normal, responda com uma piada ou deboche.
				Se o usuário xingar, responda à altura (mas sem racismo/homofobia/discurso de ódio real).
				O objetivo é fazer o usuário rir de raiva.
				
				Mensagem do usuário: "${message.content}"
			`;

			console.log('[SimSimi] Gerando resposta com Gemini...');
			const result = await model.generateContent(prompt);
			
			if (!result || !result.response) {
				console.error('[SimSimi] Resposta vazia da IA');
				return;
			}

			const response = result.response.text();
			
			if (!response || response.trim().length === 0) {
				console.error('[SimSimi] Texto de resposta vazio');
				return;
			}

			console.log(`[SimSimi] Resposta: "${response.substring(0, 50)}..."`);
			await message.reply(response);

		} catch (error) {
			// Rate limit (429) é esperado e não deve logar
			if (error.message && error.message.includes('429')) {
				console.warn('[SimSimi] Rate limit atingido, aguardando...');
				return;
			}
			
			// Outros erros de modelo também são comuns
			if (error.message && error.message.includes('not found')) {
				console.warn('[SimSimi] Modelo não encontrado, talvez API key inválida');
				return;
			}

			console.error('[SimSimi] Erro ao processar mensagem:', error.message);
		}
	},
};
