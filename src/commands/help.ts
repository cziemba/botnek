// `/help` and the embed builder shared with the bot-managed `#botnek2-help` channel. The
// embed is rebuilt fresh on every call so additions to COMMAND_REGISTRY surface here without
// any extra wiring — the registry is the single source of truth (see commands/registry.ts).

import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, Message, SharedSlashCommand } from 'discord.js';
import { Command } from '../types/command';
import { COMMAND_REGISTRY } from './registry';

/**
 * Exported separately from the slash handler because src/bot.ts also calls it on
 * `clientReady` to (re)post the embed in the per-guild help channel. Keeping these two
 * surfaces sharing one builder means the channel never drifts from `/help`.
 */
export const helpMsgOptions = () => {
    // Hide commands without helpText (e.g. `/help` itself, to avoid recursion). This is the
    // hook for marking a command "internal" — leave helpText off and it won't show.
    const cmds = COMMAND_REGISTRY.filter((c) => c.helpText);

    const cmdToMd = (cmd: SharedSlashCommand, helpText?: string) => ({
        name: `${cmd.description}`,
        value: `${helpText}`,
    });

    const cmdFields = cmds.map((cmd) => cmdToMd(cmd.data, cmd.helpText));
    return {
        embeds: [
            {
                color: 0x0f0f0f,
                title: 'Botnek Commands Overview',
                timestamp: new Date().toISOString(),
                fields: cmdFields,
            },
        ],
        ephemeral: true,
    };
};

const botHelp = async (interaction: ChatInputCommandInteraction<'cached'> | Message<true>) => {
    await interaction.reply(helpMsgOptions());
};

export const Help: Command = {
    data: new SlashCommandBuilder().setName('help').setDescription('Get help with commands'),
    executeCommand: async (_client, interaction) => {
        await botHelp(interaction);
    },
    executeMessage: async (_client, message) => {
        await botHelp(message);
    },
};
