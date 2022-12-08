import { SlashCommandBuilder } from '@discordjs/builders';
import { InteractionReplyOptions, MessageOptions } from 'discord.js';
import { Command } from '../types/command.js';
import Play from './play.js';
import Stop from './stop.js';
import Sfx from './sfx.js';
import ServerEmoji from './serverEmoji.js';
import Emote from './emote.js';
import ChatGPT from './chatgpt.js';

/**
 * For use in the bot news channel.
 */
export const helpMsgOptions = (): InteractionReplyOptions | MessageOptions => {
    const cmds: Command[] = [Play, Sfx, Stop, ServerEmoji, Emote, ChatGPT];

    const cmdToMd = (cmd: SlashCommandBuilder, helpText?: string) => ({
        name: `${cmd.description}`,
        value: `${helpText}`,
    });

    const cmdFields = cmds.map((cmd) => cmdToMd(cmd.data, cmd.helpText));
    return {
        embeds: [{
            color: '#0F0F0F',
            title: 'Botnek Commands Overview',
            timestamp: Date.now(),
            fields: cmdFields,
        }],
        ephemeral: true,
    };
};

const botHelp = async (client, interaction) => {
    await interaction.reply(helpMsgOptions());
};

export const Help: Command = {
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
