import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { commands } from './commands.js';
import chalk from 'chalk';

// Take the name of each command as key and put the execute function as the value
export const interactionCommands = commands.reduce((acc, cmd) => {
    acc[cmd.name] = cmd.execute;
    return acc;
}, {});

const rest = new REST().setToken(process.env.TOKEN);

export const deleteAllCommands = async () => {
    try {
        console.log(chalk.green('Deleting all slash commands...'));
        // for global commands
        rest
            .put(Routes.applicationCommands(process.env.APP_ID), { body: [] })
            .then(() => console.log(chalk.green('Successfully deleted all application commands.')))
            .catch(console.error);
        // for guild commands
        rest
            .put(Routes.applicationGuildCommands(process.env.APP_ID, process.env.GUILD_ID), { body: [] })
            .then(() => console.log(chalk.green('Successfully deleted all guild commands.')))
            .catch(console.error);
    } catch (error) {
        console.log(chalk.red(`There was an error: ${error}`));
    }
}

export const registerCommands = async () => {
    try {
        console.log(chalk.green('Registering slash commands...'));
        await rest.put(
            Routes.applicationCommands(process.env.APP_ID),
            { body: commands.map((cmd) => cmd.data.toJSON()) }
        );
        console.log(chalk.green('Slash commands were registered successfully!'));
    } catch (error) {
        console.log(chalk.red(`There was an error: ${error}`));
    }
};