import { SlashCommandBuilder } from '@discordjs/builders';
import {
    CommandInteraction, Message,
} from 'discord.js';
import path from 'path';
import os from 'os';
import { BotShim, Command } from '../types/command.js';
import EmoteGateway from './emotes/emoteGateway.js';
import { convertToGif, extractFrameDelay } from '../utils/imagemagick.js';

async function addEmoji(
    client: BotShim,
    interaction: CommandInteraction<'cached'> | Message<true>,
    props: { url: string, alias?: string },
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
        await emojiManager.create(emoteFilePath, alias);
    } catch (e1) {
        const tmpFile = path.resolve(os.tmpdir(), `${emote.id}-shrunk.gif`);
        const delay = await extractFrameDelay(emoteFilePath);
        await convertToGif(emoteFilePath, tmpFile, delay, '64x64^');
        // Try one more time!
        try {
            await emojiManager.create(tmpFile, alias);
        } catch (e2) {
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
        .addSubcommand((add) => add.setName('add')
            .setDescription('Add emote, see https://7tv.app/ and https://betterttv.com/')
            .addStringOption((url) => url.setName('url')
                .setRequired(true)
                .setDescription('Link to the emote (7tv or betterttv)'))
            .addStringOption((alias) => alias.setName('alias')
                .setDescription('The alias for the emote (optional, will use default name otherwise)'))),
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
