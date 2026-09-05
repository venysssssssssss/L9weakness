import fs from 'fs';
import path from 'path';
import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

// Extend Client to include commands property
declare module 'discord.js' {
    interface Client {
        commands: Collection<string, any>;
    }
}

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel]
});

client.commands = new Collection();
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

(async () => {
    try {
        console.log('[Bot] Carregando comandos...');
        for (const folder of commandFolders) {
            const commandsPath = path.join(foldersPath, folder);
            const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts') || file.endsWith('.js'));
            for (const file of commandFiles) {
                const filePath = path.join(commandsPath, file);
                
                // Skip migrated files that contain only "// Migrated..."
                const content = fs.readFileSync(filePath, 'utf-8');
                if (content.trim().startsWith('// Migrated')) continue;

                try {
                    // Dynamic import for ES modules/TS
                    const commandModule = await import(filePath);
                    const command = commandModule.default || commandModule;

                    if ('data' in command && 'execute' in command) {
                        client.commands.set(command.data.name, command);
                        console.log(`[Bot] ✅ Comando carregado: ${command.data.name}`);
                    } else {
                        console.log(`[AVISO] O comando em ${filePath} está faltando a propriedade obrigatória "data" ou "execute".`);
                    }
                } catch (error) {
                    console.error(`[Erro] Ao carregar comando ${filePath}:`, error);
                }
            }
        }

        console.log('[Bot] Carregando eventos...');
        const eventsPath = path.join(__dirname, 'events');
        const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.ts') || file.endsWith('.js'));

        for (const file of eventFiles) {
            const filePath = path.join(eventsPath, file);
            try {
                const eventModule = await import(filePath);
                const event = eventModule.default || eventModule;

                if (event.once) {
                    client.once(event.name, (...args) => event.execute(...args));
                } else {
                    client.on(event.name, (...args) => event.execute(...args));
                }
                console.log(`[Bot] ✅ Evento carregado: ${event.name}`);
            } catch (error) {
                console.error(`[Erro] Ao carregar evento ${filePath}:`, error);
            }
        }

        console.log('[Bot] Conectando ao Discord...');
        await client.login(process.env.DISCORD_TOKEN);
        console.log('[Bot] ✅ Conectado com sucesso!');

        // === Arena MTG (mesa web 24/7 p/ os links do /arena) ===
        try {
            const { ensureArenaServer, arenaPort } = await import('./arena/server');
            ensureArenaServer();
            console.log(`[Bot] 🃏 Arena MTG ouvindo na porta ${arenaPort()}`);
        } catch (e: any) {
            console.warn('[Bot] Arena falhou ao iniciar:', e.message);
        }

        // === Sistema de Aprendizado Autônomo 1h/dia + Vontade Própria ===
        try {
            const { startLearningScheduler } = await import('./utils/learning/scheduler');
            const { WillManager } = await import('./utils/learning/Will');
            const wm = new WillManager();
            const will = wm.getCurrent();
            console.log(`[Bot] 🧠 Will v${will.version} streak=${will.daily_streak} curiosidade=${will.curiosity.slice(0,3).join(', ')}`);
            startLearningScheduler();
            console.log('[Bot] 📚 Sistema de aprendizado 1h/dia ativo (NVIDIA + crawler)');
        } catch (e: any) {
            console.warn('[Bot] Learning scheduler falhou ao iniciar:', e.message);
        }
    } catch (error) {
        console.error('[Erro Fatal] Ao inicializar bot:', error);
        process.exit(1);
    }
})();
