const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { chat } = require('../../utils/ai/nvidiaClient');
const { buildTimeParserPrompt } = require('../../utils/ai/prompts');
const { getConfig } = require('../../utils/ai/config');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('limparusuario')
		.setDescription('Apaga mensagens de um usuário específico baseado em um tempo (ex: "1 hora").')
        .addUserOption(option => 
            option.setName('usuario')
                .setDescription('O usuário que terá as mensagens apagadas')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('tempo')
                .setDescription('Quanto tempo para trás? (ex: "30 minutos", "1 hora e meia", "5 horas")')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages), // Só moderadores podem usar
	    async execute(interaction) {
	        try {
	            await interaction.deferReply({ flags: 64 });
	    
	            const targetUser = interaction.options.getUser('usuario');
	            const tempoTexto = interaction.options.getString('tempo');
	            
	            if (!targetUser || !tempoTexto) {
	                await interaction.editReply('❌ Erro: Usuário ou tempo não fornecidos.');
	                return;
	            }

	            let timeLimitMs = 0;
	    
	            // 1. Tentar parser local via Regex (Muito mais rápido e economiza créditos NVIDIA)
	            const regexHoras = /(\d+)\s*(h|hora|horas)/i;
	            const regexMinutos = /(\d+)\s*(m|min|minuto|minutos)/i;
	            
	            const matchHoras = tempoTexto.match(regexHoras);
	            const matchMinutos = tempoTexto.match(regexMinutos);
	    
	            if (matchHoras || matchMinutos) {
	                if (matchHoras) timeLimitMs += parseInt(matchHoras[1]) * 3600000;
	                if (matchMinutos) timeLimitMs += parseInt(matchMinutos[1]) * 60000;
	                console.log(`[LimparUsuario] Tempo parse via Regex: ${timeLimitMs}ms`);
	            } else {
	                // 2. Fallback para NVIDIA se o regex falhar (ex: "o tempo de um filme")
					const cfg = getConfig();
					if (!cfg.apiKey) {
						console.warn('[LimparUsuario] NVIDIA_API_KEY não configurada, assumindo 1h');
						timeLimitMs = 3600000;
						await interaction.followUp({ content: '⚠️ NVIDIA_API_KEY não configurada. Assumindo 1 hora.', flags: 64 });
					} else {
						try {
							console.log('[LimparUsuario] Tentando parse via NVIDIA', cfg.textModel);
							const prompt = buildTimeParserPrompt(tempoTexto);
							const responseText = await chat({
								model: cfg.textModel,
								messages: [{ role: 'user', content: prompt }],
								temperature: 0,
								max_tokens: 500,
							});
							// Extrai último número (evita capturar reasoning com exemplo 600000)
							const nums = responseText.match(/\d+/g);
							timeLimitMs = nums ? parseInt(nums[nums.length - 1]) : NaN;
							console.log(`[LimparUsuario] Tempo parse via NVIDIA: ${timeLimitMs}ms (raw: ${responseText})`);
						} catch (error) {
							console.error("[LimparUsuario] Erro na IA NVIDIA de tempo:", error.message);
							// Se a IA falhar, assume 1 hora por segurança
							timeLimitMs = 3600000; 
							await interaction.followUp({ content: '⚠️ Erro ao interpretar o tempo com NVIDIA. Assumindo 1 hora.', flags: 64 });
						}
					}
	            }
	    
	            if (!timeLimitMs || isNaN(timeLimitMs) || timeLimitMs <= 0) {
	                 await interaction.editReply('❌ Não entendi o tempo. Tente "1 hora" ou "30 minutos".');
	                 return;
	            }

	            console.log(`[LimparUsuario] Limpando mensagens de ${targetUser.username} (${timeLimitMs}ms = ${Math.floor(timeLimitMs/60000)}min)`);
	    
	            try {
	                // 3. Calcular o Timestamp de corte
	                const now = Date.now();
	                const cutoffTime = now - timeLimitMs;

	                // 4. Buscar mensagens
	                let messagesToDelete = [];
	                let lastId;
	                let iterations = 0;
	                let totalFetched = 0;

	                // Loop para buscar mais de 100 mensagens se necessário
	                while (iterations < 4) { // Limite de 400 mensagens analisadas para não travar
	                    const options = { limit: 100 };
	                    if (lastId) options.before = lastId;

	                    const fetchedMessages = await interaction.channel.messages.fetch(options);
	                    if (fetchedMessages.size === 0) {
	                        console.log('[LimparUsuario] Nenhuma mensagem encontrada nesta iteração');
	                        break;
	                    }

	                    totalFetched += fetchedMessages.size;

	                    // Filtra as mensagens
	                    const filtered = fetchedMessages.filter(msg => 
	                        msg.author.id === targetUser.id && 
	                        msg.createdTimestamp > cutoffTime &&
	                        !msg.system // Ignora mensagens de sistema
	                    );

	                    console.log(`[LimparUsuario] Iteração ${iterations + 1}: Fetched ${fetchedMessages.size}, Filtered ${filtered.size}`);
	                    filtered.forEach(msg => messagesToDelete.push(msg));
	                    lastId = fetchedMessages.last().id;

	                    // Se a mensagem mais antiga desse lote já passou do tempo limite, paramos de buscar
	                    if (fetchedMessages.last().createdTimestamp < cutoffTime) {
	                        console.log('[LimparUsuario] Atingido tempo limite, parando busca');
	                        break;
	                    }
	                    
	                    iterations++;
	                }

	                console.log(`[LimparUsuario] Total fetched: ${totalFetched}, Para deletar: ${messagesToDelete.length}`);

	                // 5. Executar a exclusão
	                if (messagesToDelete.length === 0) {
	                    await interaction.editReply(`Não encontrei mensagens de ${targetUser} nesse período (${Math.round(timeLimitMs/60000)} minutos).`);
	                    return;
	                }

	                // O Discord só apaga até 100 por vez
	                const finalBatch = messagesToDelete.slice(0, 100);

	                await interaction.channel.bulkDelete(finalBatch, true);
	                console.log(`[LimparUsuario] ${finalBatch.length} mensagens deletadas com sucesso`);

	                await interaction.editReply(`✅ **Limpeza Concluída!**\nApaguei **${finalBatch.length}** mensagens de **${targetUser.username}** enviadas nas últimas(os) **${tempoTexto}**.\n(Interpretado como: ${Math.floor(timeLimitMs/60000)} minutos)`);

	            } catch (error) {
	                console.error('[LimparUsuario] Erro ao deletar mensagens:', error);
	                await interaction.editReply(`❌ Erro ao tentar limpar as mensagens: ${error.message.substring(0, 100)}`);
	            }
	        } catch (error) {
	            console.error('[LimparUsuario] Erro geral:', error);
	            try {
	                await interaction.editReply('❌ Erro crítico ao processar comando de limpeza.');
	            } catch (e) {
	                console.error('[LimparUsuario] Erro ao enviar mensagem de erro:', e);
	            }
	        }
	},
};
