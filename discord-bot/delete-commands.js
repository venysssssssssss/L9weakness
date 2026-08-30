const { REST, Routes } = require('discord.js');
require('dotenv').config();

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
	try {
		console.log('Iniciando a remoção de todos os comandos globais...');

		// Isso substitui todos os comandos por uma lista vazia, efetivamente deletando-os.
		await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });

		console.log('Sucesso! Todos os comandos foram apagados.');
        console.log('Agora execute "npm run deploy" para registrar os comandos corretos novamente.');
	} catch (error) {
		console.error(error);
	}
})();
