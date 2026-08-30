import { REST, Routes } from 'discord.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const commands: any[] = [];
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

(async () => {
    for (const folder of commandFolders) {
        const commandsPath = path.join(foldersPath, folder);
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts') || file.endsWith('.js'));
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            
            // Skip migrated files
            const content = fs.readFileSync(filePath, 'utf-8');
            if (content.trim().startsWith('// Migrated')) continue;

            try {
                const commandModule = await import(filePath);
                const command = commandModule.default || commandModule;

                if ('data' in command && 'execute' in command) {
                    commands.push(command.data.toJSON());
                } else {
                    console.log(`[AVISO] O comando em ${filePath} está faltando a propriedade obrigatória "data" ou "execute".`);
                }
            } catch (error) {
                console.error(`Erro ao carregar comando ${filePath}:`, error);
            }
        }
    }

    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.CLIENT_ID;

    if (!token || !clientId) {
        console.error("Missing DISCORD_TOKEN or CLIENT_ID in .env");
        process.exit(1);
    }

    const rest = new REST().setToken(token);

    try {
        console.log(`Iniciando atualização de ${commands.length} comandos de aplicativo (/).`);

        const data: any = await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );

        console.log(`Sucesso ao recarregar ${data.length} comandos de aplicativo (/).`);

        // Deploy instantâneo para guild (propagação global pode demorar até 1h)
        const guildIds = (process.env.GUILD_IDS || '1067841770504859659').split(',').map(s=>s.trim()).filter(Boolean);
        // Também tenta descobrir guilds do bot via API
        try {
            const res = await fetch('https://discord.com/api/v10/users/@me/guilds', { headers: { Authorization: `Bot ${token}` } as any });
            if (res.ok) {
                const guilds: any = await res.json();
                for (const g of guilds) if (!guildIds.includes(g.id)) guildIds.push(g.id);
            }
        } catch {}

        for (const gid of guildIds) {
            try {
                const gData: any = await rest.put(Routes.applicationGuildCommands(clientId, gid), { body: commands });
                console.log(`✅ Guild ${gid}: ${gData.length} comandos (instantâneo)`);
            } catch (e) {
                console.warn(`⚠️ Falha guild ${gid}:`, (e as Error).message);
            }
        }
    } catch (error) {
        console.error(error);
    }
})();
