const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

module.exports = {
	data: new SlashCommandBuilder()
		.setName('sherlock')
		.setDescription('Envie uma foto e eu deduzirei tudo sobre você (usando IA Vision).')
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
			if (!process.env.GEMINI_API_KEY) {
				console.error('[Sherlock] GEMINI_API_KEY não configurada');
				await interaction.editReply('❌ Erro: GEMINI_API_KEY não está configurada.');
				return;
			}

			// 1. Configurar a IA
			const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
			// Usando o modelo gemini-pro que suporta visão
			const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });

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

			console.log(`[Sherlock] Analisando imagem para dedução... Tamanho: ${imageAttachment.size} bytes`);

			// 3. Baixar a imagem e converter para base64
			const response = await fetch(imageAttachment.url);
			if (!response.ok) {
				throw new Error(`Falha ao baixar imagem: ${response.statusText}`);
			}

			const arrayBuffer = await response.arrayBuffer();
			const buffer = Buffer.from(arrayBuffer);
			
			const imagePart = {
				inlineData: {
					data: buffer.toString('base64'),
					mimeType: imageAttachment.contentType,
				},
			};

			// 4. Criar o Prompt (A personalidade do Sherlock)
			let promptText = `
				Atue como Sherlock Holmes. Eu estou te mostrando uma foto.
				Analise esta imagem minuciosamente em busca de detalhes que ninguém notaria.
				Faça uma dedução brilhante sobre o local, a pessoa que tirou a foto, ou o que está acontecendo.
				
				Seu tom deve ser: Intelectual, observador, levemente arrogante, mas impressionante.
				Use frases clássicas como "Elementar".
				
				Responda em Português do Brasil.
			`;

			if (userQuestion) {
				promptText += `\nAlém disso, responda a esta pergunta específica do usuário sobre a imagem: "${userQuestion}"`;
			}

			// 5. Gerar o conteúdo
			console.log('[Sherlock] Gerando dedução com IA...');
			const result = await model.generateContent([promptText, imagePart]);
			const text = result.response.text();

			if (!text) {
				throw new Error('Resposta vazia da IA');
			}

			console.log('[Sherlock] Dedução gerada com sucesso!');

			// 6. Enviar a resposta formatada
			const embed = new EmbedBuilder()
				.setTitle('🔍 Dedução de Sherlock')
				.setDescription(text.length > 4096 ? text.substring(0, 4093) + '...' : text)
				.setColor(0x2B2D31) // Cor escura "Noir"
				.setThumbnail('https://i.imgur.com/7j4ZkZp.png')
				.setImage(imageAttachment.url)
				.setFooter({ text: 'Análise feita pelo Gemini', iconURL: interaction.client.user.displayAvatarURL() });

			await interaction.editReply({ embeds: [embed] });

		} catch (error) {
			console.error('[Sherlock] Erro na dedução:', error);
			let errorMsg = '❌ **Erro na dedução:** Minha mente palácio está nebulosa hoje.';
			
			if (error.message.includes('429')) {
				errorMsg += ' (Muitos casos para resolver ao mesmo tempo - Rate Limit).';
			} else if (error.message.includes('404')) {
				errorMsg += ' (Modelo de dedução não encontrado).';
			} else if (error.message.includes('not found')) {
				errorMsg += ' (Modelo não encontrado. Usando fallback...)';
			} else if (error.message) {
				errorMsg += ` (${error.message.substring(0, 50)})`;
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