import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, Message } from 'discord.js';
import log from '../logging/logging';
import { BotShim, Command } from '../types/command';
import { replyMaybeEphemeral } from './queueControl';

async function skipCurrent(
    client: BotShim,
    interaction: CommandInteraction<'cached'> | Message<true>,
): Promise<void> {
    if (!interaction.guildId) {
        log.error('Interaction has no guild associated!');
        return;
    }
    const handler = client.audioHandlers.get(interaction.guildId);
    const ok = handler?.skip() ?? false;
    if (ok) {
        await replyMaybeEphemeral(interaction, 'Skipped.');
    } else {
        await replyMaybeEphemeral(interaction, 'Nothing to skip.', true);
    }
}

const Skip: Command = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the currently playing track.'),
    helpText: 'Command: `skip`',
    executeCommand: async (client, interaction) => {
        await skipCurrent(client, interaction);
    },
    executeMessage: async (client, message) => {
        await skipCurrent(client, message);
    },
};

export default Skip;
