import { SlashCommandBuilder } from '@discordjs/builders';
import { Command } from '../types/command.js';
import log from '../logging/logging.js';

const Stop: Command = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop and clear current audio queue.'),
    execute: async (client, interaction) => {
        if (interaction.guildId) {
            client.audioHandlers.get(interaction.guildId)?.stop();
            await interaction.reply({
                content: 'Stopping!',
            });
        } else {
            log.error('Interaction has no guild associated!');
        }
    },
};

export default Stop;
