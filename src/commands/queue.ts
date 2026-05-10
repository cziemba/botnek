import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, Message } from 'discord.js';
import log from '../logging/logging';
import { BotShim, Command } from '../types/command';
import { replyMaybeEphemeral } from './queueControl';

const MAX_LISTED = 20;

export function formatQueueMessage(snapshot: { nowPlaying?: string; upcoming: string[] }): string {
    const lines: string[] = [];
    if (snapshot.nowPlaying) {
        lines.push(`Now playing: \`${snapshot.nowPlaying}\``);
    } else if (snapshot.upcoming.length === 0) {
        return 'Queue is empty.';
    }
    if (snapshot.upcoming.length === 0) {
        lines.push('Up next: (nothing queued)');
        return lines.join('\n');
    }
    lines.push(`Up next (${snapshot.upcoming.length}):`);
    const visible = snapshot.upcoming.slice(0, MAX_LISTED);
    visible.forEach((title, i) => lines.push(`  ${i + 1}. ${title}`));
    const hidden = snapshot.upcoming.length - visible.length;
    if (hidden > 0) {
        lines.push(`  ...and ${hidden} more`);
    }
    return lines.join('\n');
}

async function showQueue(
    client: BotShim,
    interaction: CommandInteraction<'cached'> | Message<true>,
): Promise<void> {
    if (!interaction.guildId) {
        log.error('Interaction has no guild associated!');
        return;
    }
    const handler = client.audioHandlers.get(interaction.guildId);
    if (!handler) {
        await replyMaybeEphemeral(interaction, 'Audio handler unavailable.', true);
        return;
    }
    const snapshot = handler.getQueueSnapshot();
    await replyMaybeEphemeral(interaction, formatQueueMessage(snapshot), true);
}

const Queue: Command = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show the current audio queue.'),
    helpText: 'Command: `queue`',
    executeCommand: async (client, interaction) => {
        await showQueue(client, interaction);
    },
    executeMessage: async (client, message) => {
        await showQueue(client, message);
    },
};

export default Queue;
