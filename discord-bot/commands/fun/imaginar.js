const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('imaginar')
		.setDescription('Gera uma obra de arte única usando Inteligência Artificial!')
        .addStringOption(option => 
            option.setName('descricao')
                .setDescription('Descreva detalhadamente o que você quer ver (ex: Gato astronauta em Marte)')
                .setRequired(true)),
	async execute(interaction) {
		try {
			// A geração de imagem pode demorar uns segundos, então usamos deferReply
			await interaction.deferReply();

			const prompt = interaction.options.getString('descricao');
			
			if (!prompt || prompt.trim().length === 0) {
				await interaction.editReply('❌ Erro: Descrição não foi fornecida.');
				return;
			}

			// Adicionamos um número aleatório (seed) para garantir que a imagem seja sempre nova
			const seed = Math.floor(Math.random() * 1000000);
			
			console.log(`[Imaginar] Gerando imagem com prompt: "${prompt.substring(0, 50)}..." | Seed: ${seed}`);
			
			// Montamos a URL da API (codificando o texto para formato de URL)
			// Usamos pollinations.ai que é excelente para demonstrações gratuitas
			const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&seed=${seed}&nologo=true`;

			// Criamos um "Embed" (Cartão rico do Discord) para ficar bonito
			const arteEmbed = new EmbedBuilder()
				.setTitle('🎨 Estúdio de Arte IA')
				.setDescription(`Aqui está a sua imaginação trazida à vida!\n\n**Tema:** *"${prompt}"*`)
				.setImage(imageUrl) // A imagem gerada aparece aqui
				.setColor(0x9B59B6) // Uma cor roxa artística
				.setFooter({ text: `Gerado para ${interaction.user.username} • Seed: ${seed}`, iconURL: interaction.user.displayAvatarURL() })
				.setTimestamp();

			// Editamos a resposta inicial com o cartão pronto
			await interaction.editReply({ embeds: [arteEmbed] });
			console.log(`[Imaginar] Imagem gerada com sucesso!`);
		} catch (error) {
			console.error('[Imaginar] Erro ao executar:', error);
			try {
				await interaction.editReply({ content: '❌ Erro ao gerar a imagem. Tente novamente!', components: [] });
			} catch (e) {
				console.error('[Imaginar] Erro ao enviar mensagem de erro:', e);
			}
		}
	},
};
