import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, Message } from 'discord.js';
import log from '../logging/logging';
import { BotShim, Command } from '../types/command';
import { replyMaybeEphemeral } from './queueControl';

async function resumePlayer(
    client: BotShim,
    interaction: CommandInteraction<'cached'> | Message<true>,
): Promise<void> {
    if (!interaction.guildId) {
        log.error('Interaction has no guild associated!');
        return;
    }
    const handler = client.audioHandlers.get(interaction.guildId);
    const ok = handler?.resume() ?? false;
    if (ok) {
        await replyMaybeEphemeral(interaction, 'Resumed.');
    } else {
        await replyMaybeEphemeral(interaction, 'Nothing to resume.', true);
    }
}

const Resume: Command = {
    data: new SlashCommandBuilder().setName('resume').setDescription('Resume the paused track.'),
    helpText: 'Command: `resume`',
    executeCommand: async (client, interaction) => {
        await resumePlayer(client, interaction);
    },
    executeMessage: async (client, message) => {
        await resumePlayer(client, message);
    },
};

export default Resume;
