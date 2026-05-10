import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, Message } from 'discord.js';
import log from '../logging/logging';
import { BotShim, Command } from '../types/command';
import { replyMaybeEphemeral } from './queueControl';

async function pausePlayer(
    client: BotShim,
    interaction: CommandInteraction<'cached'> | Message<true>,
): Promise<void> {
    if (!interaction.guildId) {
        log.error('Interaction has no guild associated!');
        return;
    }
    const handler = client.audioHandlers.get(interaction.guildId);
    const ok = handler?.pause() ?? false;
    if (ok) {
        await replyMaybeEphemeral(interaction, 'Paused.');
    } else {
        await replyMaybeEphemeral(interaction, 'Nothing to pause.', true);
    }
}

const Pause: Command = {
    data: new SlashCommandBuilder().setName('pause').setDescription('Pause the current track.'),
    helpText: 'Command: `pause`',
    executeCommand: async (client, interaction) => {
        await pausePlayer(client, interaction);
    },
    executeMessage: async (client, message) => {
        await pausePlayer(client, message);
    },
};

export default Pause;
