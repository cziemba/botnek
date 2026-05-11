// `/play <url>` and `!play <url>` — enqueue a YouTube URL for live streaming.
// Mirror command for one-off plays; for persistent sound effects use `/sfx add`.

import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, Message } from 'discord.js';
import YoutubeTrack from '../audio/tracks/youtubeTrack';
import log from '../logging/logging';
import { BotShim, Command } from '../types/command';
import { replyMaybeEphemeral } from './queueControl';

export interface PlayClipParams {
    url?: string;
}

export async function playClip(
    client: BotShim,
    interaction: CommandInteraction<'cached'> | Message<true>,
    params: PlayClipParams,
): Promise<void> {
    const { url } = params;

    if (!url) {
        await replyMaybeEphemeral(interaction, 'Missing url parameter', true);
        return;
    }

    if (!YoutubeTrack.checkUrl(url)) {
        await replyMaybeEphemeral(interaction, `Url scheme not supported: \`${url}\``, true);
        return;
    }

    const guild = interaction.member?.guild ?? undefined;
    const channelId = interaction.member?.voice.channel?.id;
    if (!guild || !channelId) {
        await replyMaybeEphemeral(
            interaction,
            'You must join a voice channel to play audio.',
            true,
        );
        return;
    }

    log.debug(
        `Valid play request from channel[${interaction.member.voice.channel?.id}] in guild[${interaction.member.voice.guild.id}]`,
    );

    const audioHandler = client.audioHandlers.get(interaction.guildId);
    if (!audioHandler) {
        log.error(`Audio handler was never initialized for guild[${interaction.guildId}`);
        await replyMaybeEphemeral(interaction, "I'm sorry, something went wrong", true);
        return;
    }

    // Reply BEFORE the YouTube round-trip. Slash interactions have a 3-second window to
    // get an initial response; YoutubeTrack.fromUrl can easily exceed that on a cold
    // YouTube fetch, which would 404 the interaction token. We accept the (small) lie
    // that the URL is queued before we've confirmed it resolves — if fromUrl throws
    // below, the user sees an unhandled-promise log but the bot stays alive.
    await replyMaybeEphemeral(interaction, `Added ${url} to the queue`);

    const youtubeTrack = await YoutubeTrack.fromUrl(url);
    await audioHandler.enqueue({ interaction, track: youtubeTrack });
}

const Play: Command = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a youtube clip in your current channel.')
        .addStringOption((option) =>
            option.setName('url').setDescription('The url').setRequired(true),
        ),
    helpText: `
        Usage:
            \`play <url>\`
        Example:
            \`play https://www.youtube.com/watch?v=dQw4w9WgXcQ\`
    `,
    executeCommand: async (client, interaction) => {
        if (!interaction.inCachedGuild() || !interaction.isCommand()) {
            return;
        }
        const url = interaction.options.getString('url', true);

        await playClip(client, interaction, { url });
    },
    executeMessage: async (client, message, args) => {
        await playClip(client, message, { url: args[0] });
    },
};

export default Play;
