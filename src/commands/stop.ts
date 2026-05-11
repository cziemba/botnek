// `/stop` — hard stop. Clears the queue AND tears down the voice connection.
// Use `/skip` to advance past the current track without flushing what's queued behind it.

import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, Message } from 'discord.js';
import log from '../logging/logging';
import { BotShim, Command } from '../types/command';
import { replyMaybeEphemeral } from './queueControl';

const stopSound = async (
    client: BotShim,
    interaction: CommandInteraction<'cached'> | Message<true>,
) => {
    if (interaction.guildId) {
        client.audioHandlers.get(interaction.guildId)?.stop();
        await replyMaybeEphemeral(interaction, 'Stopping!');
    } else {
        log.error('Interaction has no guild associated!');
    }
};

const Stop: Command = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop and clear current audio queue.'),
    helpText: 'Command: `stop`',
    executeCommand: async (client, interaction) => {
        await stopSound(client, interaction);
    },
    executeMessage: async (client, message) => {
        await stopSound(client, message);
    },
};

export default Stop;
