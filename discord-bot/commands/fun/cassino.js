const { SlashCommandBuilder } = require('discord.js');

// Função de espera para criar o efeito de animação
const wait = require('node:timers/promises').setTimeout;

module.exports = {
	data: new SlashCommandBuilder()
		.setName('cassino')
		.setDescription('Tente a sorte na máquina caça-níquel com animação!'),
	async execute(interaction) {
		try {
			// Emojis possíveis na roleta
			const slots = ['🍒', '🍋', '🍇', '🍉', '🔔', '💎', '7️⃣'];
			
			// Responde inicial
			console.log('[Cassino] Iniciando jogo de cassino...');
			await interaction.reply({ content: '🎰 **GIRANDO A ROLETA...** 🎰' });

			// Função para pegar um emoji aleatório
			const randomSlot = () => slots[Math.floor(Math.random() * slots.length)];

			// O resultado final (já decidido agora, mas o usuário não sabe)
			const slot1 = randomSlot();
			const slot2 = randomSlot();
			const slot3 = randomSlot();

			// Animação: Vamos editar a mensagem 3 vezes para simular o giro
			// Frame 1
			await wait(800);
			await interaction.editReply(`🎰 **GIRANDO...** 🎰\n` + 
			`\t[ ${randomSlot()} | ${randomSlot()} | ${randomSlot()} ]`);
			
			// Frame 2
			await wait(800);
			await interaction.editReply(`🎰 **GIRANDO...** 🎰\n` + 
			`\t[ ${slot1} | ${randomSlot()} | ${randomSlot()} ]`); // A primeira trava

			// Frame 3
			await wait(800);
			await interaction.editReply(`🎰 **GIRANDO...** 🎰\n` + 
			`\t[ ${slot1} | ${slot2} | ${randomSlot()} ]`); // A segunda trava

			// Resultado Final
			await wait(800);
			
			let resultadoTexto = '';
			
			// Lógica de Vitória
			if (slot1 === slot2 && slot2 === slot3) {
				resultadoTexto = `🎉 **JACKPOT! VOCÊ TIROU A SORTE GRANDE!** 🎉\n` + 
				`Ganhou um prêmio imaginário de R$ 1.000.000!`;
				console.log('[Cassino] Jackpot! Usuário venceu!');
			} else if (slot1 === slot2 || slot2 === slot3 || slot1 === slot3) {
				resultadoTexto = `✨ **Quase lá!** Você acertou 2 iguais e ganhou um prêmio de consolação.`;
				console.log('[Cassino] Vitória parcial');
			} else {
				resultadoTexto = `❌ **Não foi dessa vez.** Tente novamente!`;
				console.log('[Cassino] Derrota');
			}

			await interaction.editReply(`🎰 **RESULTADO FINAL** 🎰\n` + 
			`\t[ ${slot1} | ${slot2} | ${slot3} ]\n\n${resultadoTexto}`);
		} catch (error) {
			console.error('[Cassino] Erro ao executar:', error);
			try {
				await interaction.reply({ content: '❌ Erro ao girar a roleta!', flags: 64 });
			} catch (e) {
				console.error('[Cassino] Erro ao enviar mensagem de erro:', e);
			}
		}
	},
};