import { SlashCommandBuilder } from '@discordjs/builders';
import { Command } from '../types/command.js';
import YoutubeTrack from '../audio/tracks/youtubeTrack.js';
import log from '../logging/logging.js';

const Play: Command = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a youtube clip in your current channel.')
        .addStringOption((option) => option.setName('url')
            .setDescription('The url')
            .setRequired(true)),
    helpText: `
        Usage:
            \`/play <url>\`
        Example:
            \`/play https://www.youtube.com/watch?v=dQw4w9WgXcQ\`
    `,
    execute: async (client, interaction) => {
        if (!interaction.inCachedGuild() || !interaction.isCommand()) {
            return;
        }

        const url = interaction.options.getString('url', true);

        if (!YoutubeTrack.checkUrl(url)) {
            await interaction.reply({
                ephemeral: true,
                content: `Url scheme not supported: \`${url}\``,
            });
            return;
        }

        const { guild } = interaction.member;
        const channelId = interaction.member.voice.channel?.id;
        if (!guild || !channelId) {
            await interaction.reply({
                content: 'You must join a voice channel to play audio.',
                ephemeral: true,
            });
            return;
        }

        log.debug(`Valid play request from channel[${interaction.member.voice.channel?.id}] in guild[${interaction.member.voice.guild.id}]`);

        const audioHandler = client.audioHandlers.get(interaction.guildId);
        if (!audioHandler) {
            log.error(`Audio handler was never initialized for guild[${interaction.guildId}`);
            await interaction.reply({
                content: 'I\'m sorry, something went wrong',
                ephemeral: true,
            });
            return;
        }

        await interaction.reply({
            content: `Added ${url} to the queue`,
        });

        const youtubeTrack = await YoutubeTrack.fromUrl(url);
        await audioHandler.enqueue({ interaction, track: youtubeTrack });
    },
};

export default Play;
