const { Events } = require('discord.js');

module.exports = {
	name: Events.ClientReady,
	once: true,
	execute(client) {
		console.log(`Pronto! Logado como ${client.user.tag}`);
        client.user.setActivity('o servidor 24/7', { type: 3 }); // Watching ...
	},
};