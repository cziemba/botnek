// `/emoji add`: promote a 7TV/BTTV emote to a real Discord server custom emoji via
// `guild.emojis.create`. The fetch pipeline is shared with `/emote`, but the upload target is
// constrained: Discord enforces a 256KiB hard cap on custom emoji files (animated and static
// alike) and a per-guild emoji slot count. We can't pre-check the size accurately because the
// cached gif was sized for webhook attachments (no upper bound), so the strategy is "try once at
// the standard size, on failure re-encode at 64x64 and retry." A second failure is reported back
// as a user-facing error.
import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, Message } from 'discord.js';
import os from 'os';
import path from 'path';
import log from '../logging/logging.js';
import { BotShim, Command } from '../types/command';
import { convertToGif, extractFrameDelay } from '../utils/imagemagick';
import EmoteGateway from './emotes/emoteGateway';

async function addEmoji(
    client: BotShim,
    interaction: CommandInteraction<'cached'> | Message<true>,
    props: { url: string; alias?: string },
): Promise<void> {
    const emotePath = path.resolve(path.join(client.config.dataRoot, EmoteGateway.EMOTE_DIR));
    const emojiManager = interaction.guild.emojis;

    let emote;
    const bttvId = client.emoteGateways.bttvGateway.tryParseUrl(props.url);
    const sevenTvId = client.emoteGateways.sevenTvGateway.tryParseUrl(props.url);
    if (bttvId) {
        emote = await client.emoteGateways.bttvGateway.fetchEmote(bttvId);
    }

    if (sevenTvId) {
        emote = await client.emoteGateways.sevenTvGateway.fetchEmote(sevenTvId);
    }

    if (!emote) {
        await interaction.reply('Something went wrong');
        throw new Error(`Could not fetch emoji for url ${props.url}`);
    }

    const alias = props.alias || emote.defaultAlias;

    const emoteFilePath = path.join(emotePath, `${emote.id}.gif`);
    try {
        await emojiManager.create({ attachment: emoteFilePath, name: alias });
    } catch (e1) {
        // First failure is overwhelmingly "asset over 256KiB" (Discord's emoji size cap), but we
        // can't read the error category cleanly so we retry on every failure. The shrunk version
        // goes to os.tmpdir() rather than the persistent emote cache because it's specific to
        // server-emoji upload — the webhook send path still uses the full-size cached gif and we
        // don't want this branch to silently degrade `/emote` rendering by overwriting the cache.
        log.warn(e1, 'There was a problem setting emoji. Trying one more time with reduced size.');
        const tmpFile = path.resolve(os.tmpdir(), `${emote.id}-shrunk.gif`);
        const delay = await extractFrameDelay(emoteFilePath);
        // 64x64 is roughly Discord's reaction-picker render size; below this the emoji is
        // unrecognizable. If even this fails the source is too detail-dense to compress further
        // without ImageMagick `-quality` knobs we don't currently expose.
        await convertToGif(emoteFilePath, tmpFile, delay, '64x64^');
        try {
            await emojiManager.create({ attachment: tmpFile, name: alias });
        } catch (e2) {
            log.warn(e2, 'Second attempt failed, giving up.');
            await interaction.reply({
                content: `Failed to upload after two attempts at optimizing. Emoji <${props.url}> is probably too large.`,
            });
            return;
        }
    }
    await interaction.reply({
        content: `Added ${alias}`,
    });
}

const ServerEmoji: Command = {
    data: new SlashCommandBuilder()
        .setName('emoji')
        .setDescription('Control server emojis')
        .addSubcommand((add) =>
            add
                .setName('add')
                .setDescription('Add emote, see https://7tv.app/ and https://betterttv.com/')
                .addStringOption((url) =>
                    url
                        .setName('url')
                        .setRequired(true)
                        .setDescription('Link to the emote (7tv or betterttv)'),
                )
                .addStringOption((alias) =>
                    alias
                        .setName('alias')
                        .setDescription(
                            'The alias for the emote (optional, will use default name otherwise)',
                        ),
                ),
        ),
    helpText: `
        Interact with discord-managed emojis. Can add static/animated emojis from BTTV and 7TV.
        Usage:
            \`emoji add <7tv.app or betterttv.com url> [alias: optional]\` - Adds an emoji to the server
    `,
    executeCommand: async (client, interaction) => {
        if (!interaction.inCachedGuild() || !interaction.isCommand()) {
            return;
        }
        const subCommand = interaction.options.getSubcommand(true);
        if (subCommand === 'add') {
            const url = interaction.options.getString('url', true);
            const alias = interaction.options.getString('alias') || undefined;
            await addEmoji(client, interaction, { url, alias });
        }
    },
    executeMessage: async (client, message, args) => {
        switch (args[0]) {
            case 'add':
                await addEmoji(client, message, { url: args[1], alias: args[2] });
                break;
            default:
        }
    },
};

export default ServerEmoji;
