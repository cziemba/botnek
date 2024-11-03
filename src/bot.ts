import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import {
    CacheType,
    ChannelType,
    ChatInputCommandInteraction,
    Client,
    GatewayIntentBits,
    Guild,
    Interaction,
    Message,
    MessageCreateOptions,
    MessageEditOptions,
    OverwriteResolvable,
    PermissionFlagsBits,
    TextChannel,
} from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';
import AudioHandler from './audio/audioHandler.ts';
import COMMANDS from './commands.ts';
import BetterTTVEmoteGateway from './commands/emotes/betterTTVEmoteGateway.ts';
import handleSingleEmote from './commands/emotes/emote.ts';
import SevenTVEmoteGateway from './commands/emotes/sevenTVEmoteGateway.ts';
import { helpMsgOptions } from './commands/help.ts';
import GuildDatabase from './data/db.ts';
import EmoteConfigManager from './data/emoteConfigManager.ts';
import { isEmoteAlias } from './data/types/emote.ts';
import log from './logging/logging.ts';
import { BotnekConfig } from './types/config.ts';
import GuildResource from './types/guildResource.ts';

const DB_FILE: string = 'db.json';

/**
 * Represents the Botnek Discord bot.
 * @class
 */
export default class Botnek {
    private readonly client: Client;

    private readonly audioHandlers: GuildResource<AudioHandler>;

    private readonly databases: GuildResource<GuildDatabase>;

    private readonly config: BotnekConfig;

    /**
     * Creates an instance of Botnek.
     * @constructor
     * @param {BotnekConfig} config - The configuration for Botnek.
     */
    constructor(config: BotnekConfig) {
        this.audioHandlers = new GuildResource<AudioHandler>();
        this.databases = new GuildResource<GuildDatabase>();
        this.config = config;

        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
            ],
        });

        this.client.once('ready', async () => {
            if (!this.client.user || !this.client.application) {
                return;
            }

            const clientId = this.client.user.id;
            const guilds = Array.from(this.client.guilds.cache.values());

            if (guilds.length === 0) {
                throw new Error("I'm not in any guilds!, Exiting.");
            }

            const rest = new REST({ version: '10' }).setToken(config.token);

            // Set any bot-level commands that don't require guild info/presence.
            await rest.put(Routes.applicationCommands(clientId), {
                body: [],
            });

            // Init commands/db for each guild
            await Promise.all(
                guilds.map(async (g) => {
                    log.info(
                        `${this.client.user?.username} is running [clientId=${clientId}, guildId=${g.id}] in ${g.name}`,
                    );

                    this.initGuildResources(g.id, config.dataRoot);

                    await this.initHelpChannel(g);

                    return rest.put(Routes.applicationGuildCommands(clientId, g.id), {
                        body: COMMANDS.map((c) => c.data),
                    });
                }),
            );
        });

        // Register the slash command handler and routing logic.
        this.client.on('interactionCreate', async (interaction: Interaction<CacheType>) => {
            if (!interaction.isCommand() || !interaction.inCachedGuild()) return;

            log.info(`${interaction.commandName} command received!`);

            const slashCommand = COMMANDS.find((c) => c.data.name === interaction.commandName);
            if (!slashCommand || !(interaction instanceof ChatInputCommandInteraction)) {
                await interaction.followUp({
                    content: 'Oops, an error occurred!',
                    ephemeral: true,
                });
                return;
            }

            await slashCommand.executeCommand(
                {
                    client: this.client,
                    config: this.config,
                    audioHandlers: this.audioHandlers,
                    databases: this.databases,
                    emoteGateways: {
                        sevenTvGateway: new SevenTVEmoteGateway(this.config),
                        bttvGateway: new BetterTTVEmoteGateway(this.config),
                    },
                },
                interaction,
            );
        });

        // Register the prefix command handler and routing logic.
        this.client.on('messageCreate', async (message: Message) => {
            if (message.author.bot || !message.inGuild()) return;
            // First assume the message is an emote.
            if (!message.content.startsWith('!')) {
                await this.tryHandleEmote(message);
                return;
            }
            const cmdArgs = message.content.substring(1).split(' ');
            log.info(`${cmdArgs[0]} command received!`);

            const prefixCommand = COMMANDS.find((c) => c.data.name === cmdArgs[0]);
            if (!prefixCommand) {
                log.info(`Ignoring unknown cmd ${cmdArgs[0]}`);
                return;
            }

            if (prefixCommand.requireUserInChannel && !message.member?.voice.channel) {
                await message.reply({
                    content: 'You must join a voice channel before sending a command',
                });
                return;
            }

            const botShim = {
                client: this.client,
                config: this.config,
                audioHandlers: this.audioHandlers,
                databases: this.databases,
                emoteGateways: {
                    sevenTvGateway: new SevenTVEmoteGateway(this.config),
                    bttvGateway: new BetterTTVEmoteGateway(this.config),
                },
            };

            try {
                await prefixCommand.executeMessage(botShim, message, cmdArgs.slice(1));
            } catch (e) {
                await message.reply({
                    content: `An error occurred ${e}`,
                });
            }
        });
    }

    /**
     * Tries to handle emotes in a message.
     * @private
     * @param {Message<true>} message - The message to handle emotes in.
     * @returns {Promise<void>} - A Promise that resolves when emotes are handled.
     */
    private async tryHandleEmote(message: Message<true>): Promise<void> {
        // TODO: handle multiple emotes in one message https://imagemagick.org/Usage/anim_mods/#merging
        const msg = message.content.trim();
        if (!isEmoteAlias(msg)) return;
        const emoteConfigManager = new EmoteConfigManager(this.databases.get(message.guildId).db);
        if (!emoteConfigManager.aliasExists(msg)) return;
        const emote = emoteConfigManager.get(msg);
        await handleSingleEmote(
            {
                client: this.client,
                config: this.config,
                audioHandlers: this.audioHandlers,
                databases: this.databases,
                emoteGateways: {
                    sevenTvGateway: new SevenTVEmoteGateway(this.config),
                    bttvGateway: new BetterTTVEmoteGateway(this.config),
                },
            },
            message,
            emote,
        );
    }

    /**
     * Initializes the help channel for Botnek.
     * @private
     * @returns {Promise<void>} - A Promise that resolves when the help channel is initialized.
     */
    private async initHelpChannel(guild: Guild): Promise<void> {
        const botnekHelpName = 'botnek2-help';
        let botnekHelpChannel = guild.channels.cache
            .filter((c) => c.type === ChannelType.GuildText)
            .map((c) => c as TextChannel)
            .find((c) => c.name === botnekHelpName);

        const helpChannelPermissions: OverwriteResolvable[] = [
            {
                id: guild.roles.everyone,
                deny: [
                    PermissionFlagsBits.CreatePublicThreads,
                    PermissionFlagsBits.CreatePublicThreads,
                    PermissionFlagsBits.CreatePrivateThreads,
                    PermissionFlagsBits.SendTTSMessages,
                    PermissionFlagsBits.SendMessagesInThreads,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.AddReactions,
                    PermissionFlagsBits.UseApplicationCommands,
                ],
            },
            {
                id: this.client.user!.id,
                allow: [PermissionFlagsBits.SendMessages],
            },
        ];

        if (!botnekHelpChannel) {
            log.info('Creating the help channel');
            botnekHelpChannel = await guild.channels.create({
                name: botnekHelpName,
                type: ChannelType.GuildText,
                topic: 'How to use botnek!',
                permissionOverwrites: helpChannelPermissions,
            });
        } else {
            log.info('Updating help channel (permissions-only)');
            await botnekHelpChannel.permissionOverwrites.set(helpChannelPermissions);
        }

        if (!botnekHelpChannel.isTextBased()) {
            throw new Error(
                `Help channel ${botnekHelpName} exists but is corrupted. Please delete it and try again.`,
            );
        }
        const helpChannelMsgs = [...(await botnekHelpChannel.messages.fetch()).values()];
        const botMsg = helpChannelMsgs
            .sort((m) => m.createdTimestamp)
            .findLast((m) => m?.author.id === this.client.user?.id);

        // Delete all other messages in help channel.
        await Promise.all(
            helpChannelMsgs.filter((m) => m.id !== botMsg?.id).map((m) => m.delete()),
        );

        if (!botMsg) {
            log.info('Initializing the help text');
            await botnekHelpChannel.send(helpMsgOptions() as MessageCreateOptions);
            return;
        }
        log.info('Updating the help text');
        await botMsg.edit(helpMsgOptions() as MessageEditOptions);
    }

    /**
     * Initializes guild-specific resources for Botnek, such as settings and data, for a given guild ID.
     *
     * @param {string} guildId - The ID of the guild for which to initialize resources.
     * @param {string} dataRoot - The root directory path where guild-specific data is stored.
     * @returns {Promise<void>} - A Promise that resolves when the guild resources are initialized.
     */
    private initGuildResources(guildId: string, dataRoot: string) {
        const guildDbPath = path.resolve(`${dataRoot}/${guildId}`);
        fs.mkdirSync(guildDbPath, { recursive: true });

        this.audioHandlers.put(guildId, new AudioHandler());

        const dbPath = path.join(guildDbPath, DB_FILE);
        this.databases.put(guildId, new GuildDatabase(dbPath));
    }

    public async login(token: string): Promise<void> {
        await this.client.login(token);
        log.debug('Logged in!');
    }
}
