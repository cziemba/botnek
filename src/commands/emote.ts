import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, Message, TextChannel, Webhook } from 'discord.js';
import { LowWithLodash } from '../data/db';
import EmoteConfigManager from '../data/emoteConfigManager';
import { GuildData } from '../data/types';
import { EmoteSource, isEmoteAlias } from '../data/types/emote';
import log from '../logging/logging';
import { BotShim, Command } from '../types/command';

export const EMOTE_HOOK_NAME: string = 'emojiHook';

function webhookDb(db: LowWithLodash<GuildData>) {
    return db.chain.get('webhooks');
}

export async function tryRegisterEmoteHook(
    client: BotShim,
    interaction: CommandInteraction<'cached'> | Message<true>,
): Promise<void> {
    if (interaction.channel === null || !interaction.channel.isTextBased()) return;
    const db = client.databases.get(interaction.guildId)?.db!;
    const { channel, channelId } = interaction;

    const existingWebhook = webhookDb(db)
        .get(channelId)
        .find({ hookName: EMOTE_HOOK_NAME })
        .value();
    if (existingWebhook) {
        await interaction.reply({
            content: 'Emote are already enabled!',
        });
        return;
    }

    if (!db.data!.webhooks) {
        db.data!.webhooks = {};
    }

    if (!db.data!.webhooks[channelId]) {
        db.data!.webhooks[channelId] = [];
    }

    const webhook: Webhook = await (channel as TextChannel).createWebhook({
        name: EMOTE_HOOK_NAME,
    });
    log.info(`Created hook ${EMOTE_HOOK_NAME} -> ${webhook.id} w/ token ${webhook.token}`);
    db.data!.webhooks[channelId].push({
        id: webhook.id,
        hookName: EMOTE_HOOK_NAME,
        token: webhook.token!,
    });
    db.write();

    await webhook.send({
        content: `Registered ${EMOTE_HOOK_NAME} in ${channel.name}`,
        username: `Botnek (replying to ${interaction.member?.displayName})`,
    });
}

async function emoteList(
    client: BotShim,
    interaction: CommandInteraction<'cached'> | Message<true>,
): Promise<void> {
    const emoteConfigManager = new EmoteConfigManager(client.databases.get(interaction.guildId).db);
    const emotes = emoteConfigManager.listEmotes();
    const sevenTvUrl = (id: string) => `https://7tv.app/emotes/${id}`;
    const bttvUrl = (id: string) => `https://betterttv.com/emotes/${id}`;
    const emoteText = emotes
        .map(([alias, e]) => {
            let url = '';
            switch (e.source) {
                case EmoteSource.BTTV:
                    url = bttvUrl(e.id);
                    break;
                case EmoteSource.SEVENTV:
                    url = sevenTvUrl(e.id);
                    break;
                default:
            }
            return `\`${alias}\`: <${url}>`;
        })
        .join('\n');
    await interaction.reply({
        content: emoteText || 'No emotes!',
    });
}

async function tryRemoveEmoteHook(
    client: BotShim,
    interaction: CommandInteraction<'cached'> | Message<true>,
): Promise<void> {
    await interaction.reply({
        content: '`TODO: not implemented yet`',
    });
}

async function addEmote(
    client: BotShim,
    interaction: CommandInteraction<'cached'> | Message<true>,
    props: { url: string; alias?: string },
): Promise<void> {
    const emoteConfigManager = new EmoteConfigManager(client.databases.get(interaction.guildId).db);
    if (props.alias) {
        if (!isEmoteAlias(props.alias)) {
            await interaction.reply(`Invalid characters in alias: \`${props.alias}\``);
            return;
        }
        if (emoteConfigManager.aliasExists(props.alias)) {
            await interaction.reply(`Emote \`${props.alias}\` already exists`);
            return;
        }
    }

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
        throw new Error(`Could not fetch emote for url ${props.url}`);
    }

    const alias = props.alias || emote.defaultAlias;
    if (!isEmoteAlias(alias)) {
        await interaction.reply(`Invalid characters in alias: \`${alias}\``);
        return;
    }

    emoteConfigManager.put(alias, emote);
    await interaction.reply({
        content: `Added ${alias}`,
    });
}

async function removeEmote(
    client: BotShim,
    interaction: CommandInteraction<'cached'> | Message<true>,
    alias: string,
): Promise<void> {
    const emoteConfigManager = new EmoteConfigManager(client.databases.get(interaction.guildId).db);

    if (!isEmoteAlias(alias)) {
        await interaction.reply(`Invalid characters in alias: \`${alias}\``);
        return;
    }

    if (!emoteConfigManager.aliasExists(alias)) {
        await interaction.reply(`Emote \`${alias}\` does not exist`);
        return;
    }

    emoteConfigManager.remove(alias);
    await interaction.reply({
        content: `Removed ${alias}`,
    });
}

const Emote: Command = {
    data: new SlashCommandBuilder()
        .setName('emote')
        .setDescription('Control emote support')
        .addSubcommand((enable) =>
            enable
                .setName('enable')
                .setDescription('Enable emoji support in this channel (default)'),
        )
        .addSubcommand((disable) =>
            disable.setName('disable').setDescription('Disable emoji support in this channel'),
        )
        .addSubcommand((list) => list.setName('list').setDescription('List available emotes'))
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
        )
        .addSubcommand((remove) =>
            remove
                .setName('remove')
                .setDescription('Remove an emote')
                .addStringOption((alias) =>
                    alias
                        .setName('alias')
                        .setRequired(true)
                        .setDescription('The alias of the emote to remove'),
                ),
        ),
    helpText: `
        Interact with webhook based emotes. When an alias is recognized botnek replaces the message with the appropriate emote.
        Not the same as discord's server-based emojis but have no size limitation.
        Usage:
            \`emote add <7tv.app or betterttv.com url> [alias: optional]\` - Adds an emote
            \`emote remove <alias>\` - Removes an emote
            \`emote list\` - To see available emotes
            \`emote\` - To enable emotes in the current channel
    `,
    executeCommand: async (client, interaction) => {
        if (!interaction.inCachedGuild() || !interaction.isCommand()) {
            return;
        }
        const subCommand = interaction.options.getSubcommand(true);
        if (subCommand === 'list') {
            await emoteList(client, interaction);
        } else if (subCommand === 'add') {
            const url = interaction.options.getString('url', true);
            const alias = interaction.options.getString('alias') || undefined;
            await addEmote(client, interaction, { url, alias });
        } else if (subCommand === 'remove') {
            const alias = interaction.options.getString('alias', true);
            await removeEmote(client, interaction, alias);
        } else if (subCommand === 'disable') {
            await tryRemoveEmoteHook(client, interaction);
        } else if (subCommand === 'enable') {
            await tryRegisterEmoteHook(client, interaction);
        }
    },
    executeMessage: async (client, message, args) => {
        switch (args[0]) {
            case 'list':
                await emoteList(client, message);
                return;
            case 'add':
                await addEmote(client, message, { url: args[1], alias: args[2] });
                return;
            case 'remove':
                await removeEmote(client, message, args[1]);
                return;
            case 'disable':
                await tryRemoveEmoteHook(client, message);
                return;
            case 'enable':
            default:
                // Assume registering hook
                await tryRegisterEmoteHook(client, message);
        }
    },
};

export default Emote;
