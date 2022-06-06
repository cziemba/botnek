import { SlashCommandBuilder } from '@discordjs/builders';
import { Command } from '../types/command.js';
import Play from './play.js';
import Stop from './stop.js';
import Sfx from './sfx.js';

const botHelp = async (client, interaction) => {
    const cmds: Command[] = [Play, Sfx, Stop];

    const cmdToMd = (cmd: SlashCommandBuilder, helpText?: string) => ({
        name: `${cmd.description}`,
        value: `${helpText}`,
    });

    const cmdFields = cmds.map((cmd) => cmdToMd(cmd.data, cmd.helpText));
    await interaction.reply({
        embeds: [{
            color: '#0F0F0F',
            title: 'Botnek Commands Overview',
            timestamp: Date.now(),
            fields: cmdFields,
        }],
        ephemeral: true,
    });
};

const Help: Command = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Get help with commands'),
    executeCommand: async (client, interaction) => {
        await botHelp(client, interaction);
    },
    executeMessage: async (client, message) => {
        await botHelp(client, message);
    },
};

export default Help;
