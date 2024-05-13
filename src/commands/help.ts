import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, Message, SharedSlashCommand } from 'discord.js';
import { Command } from '../types/command.ts';
import Play from './play.ts';
import Stop from './stop.ts';
import Sfx from './sfx.ts';
import ServerEmoji from './serverEmoji.ts';
import Emote from './emote.ts';
import ChatGPT from './chatgpt.ts';

/**
 * Exported for use in the bot news channel.
 */
export const helpMsgOptions = () => {
    const cmds: Command[] = [Play, Sfx, Stop, ServerEmoji, Emote, ChatGPT];

    const cmdToMd = (cmd: SharedSlashCommand, helpText?: string) => ({
        name: `${cmd.description}`,
        value: `${helpText}`,
    });

    const cmdFields = cmds.map((cmd) => cmdToMd(cmd.data, cmd.helpText));
    return {
        embeds: [{
            color: 0x0F0F0F,
            title: 'Botnek Commands Overview',
            timestamp: new Date().toISOString(),
            fields: cmdFields,
        }],
        ephemeral: true,
    };
};

const botHelp = async (interaction: ChatInputCommandInteraction<'cached'> | Message<true>) => {
    await interaction.reply(helpMsgOptions());
};

export const Help: Command = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Get help with commands'),
    executeCommand: async (_client, interaction) => {
        await botHelp(interaction);
    },
    executeMessage: async (_client, message) => {
        await botHelp(message);
    },
};
