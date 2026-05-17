import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { registerCommands, deleteAllCommands, interactionCommands } from './register_commands.js';
import { clearResourceFolder } from './utils.js';
import chalk from 'chalk';
import fs from 'fs';

export const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        
    ]
});

client.once('clientReady', async () => {
    console.log(chalk.green(`Logged in as ${client.user.tag}`));
    if (!fs.existsSync('resource')) {
        fs.mkdirSync('resource');
        console.log('Created resource directory for first time');
    }
    clearResourceFolder();
    await deleteAllCommands();
    await registerCommands();
    console.log(chalk.green.bgGreenBright('Bot is ready!'));
});

client.on('interactionCreate', (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interactionCommands[interaction.commandName]) {
        return interactionCommands[interaction.commandName](interaction);
    }
});

client.login(process.env.TOKEN);