import { SlashCommandBuilder } from '@discordjs/builders';
import log from '../logging/logging.ts';
import { Command } from '../types/command.ts';

const stopSound = async (client, interaction) => {
    if (interaction.guildId) {
        client.audioHandlers.get(interaction.guildId)?.stop();
        await interaction.reply({
            content: 'Stopping!',
        });
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
