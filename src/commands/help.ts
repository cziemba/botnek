import { SlashCommandBuilder } from '@discordjs/builders';
import { Command } from '../types/command.js';
import Play from './play.js';
import Stop from './stop.js';
import Sfx from './sfx.js';

const Help: Command = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Get help with commands'),
    execute: async (client, interaction) => {
        if (!interaction.inCachedGuild() || !interaction.isCommand()) {
            return;
        }

        const cmds: Command[] = [Play, Sfx, Stop, Help];

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
    },
};

export default Help;
