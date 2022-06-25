import { Client, Intents, Message } from 'discord.js';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import * as fs from 'fs';
import * as path from 'path';
import Commands from './commands.js';
import AudioHandler from './audio/audioHandler.js';
import GuildResource from './types/guildResource.js';
import log from './logging/logging.js';
import GuildDatabase from './data/db.js';
import { BotnekConfig } from './types/config.js';
import handleSingleEmote from './commands/emotes/emote.js';
import { isEmoteAlias } from './data/types/emote.js';
import EmoteConfigManager from './data/emoteConfigManager.js';
import SevenTVEmoteGateway from './commands/emotes/sevenTVEmoteGateway.js';
import BetterTTVEmoteGateway from './commands/emotes/betterTTVEmoteGateway.js';

const DB_FILE: string = 'db.json';

export default class Botnek {
    private readonly client: Client;

    private readonly audioHandlers: GuildResource<AudioHandler>;

    private readonly databases: GuildResource<GuildDatabase>;

    private readonly config: BotnekConfig;

    constructor(config: BotnekConfig) {
        this.audioHandlers = new GuildResource<AudioHandler>();
        this.databases = new GuildResource<GuildDatabase>();
        this.config = config;

        this.client = new Client({
            intents: [
                Intents.FLAGS.GUILD_VOICE_STATES,
                Intents.FLAGS.GUILDS,
                Intents.FLAGS.GUILD_MESSAGES,
            ],
        });

        this.client.once('ready', async () => {
            if (!this.client.user || !this.client.application) {
                return;
            }

            const clientId = this.client.user.id;
            const guilds = Array.from(this.client.guilds.cache.values());

            if (guilds.length === 0) {
                throw new Error('I\'m not in any guilds!, Exiting.');
            }

            const rest = new REST({ version: '10' }).setToken(config.token);

            // Init for each guild
            await Promise.all(guilds.map((g) => {
                log.info(`${this.client.user?.username} is running [clientId=${clientId}, guildId=${g.id}]`);

                this.initGuildResources(g.id, config.dataRoot);

                return rest.put(
                    Routes.applicationGuildCommands(clientId, g.id),
                    {
                        body: Commands.map((c) => c.data),
                    },
                );
            }));
        });

        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isCommand() || !interaction.inCachedGuild()) return;

            log.info(`${interaction.commandName} command received!`);

            const slashCommand = Commands.find((c) => c.data.name === interaction.commandName);
            if (!slashCommand) {
                await interaction.followUp({ content: 'Oops, an error occurred!', ephemeral: true });
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

        this.client.on('messageCreate', async (message: Message<boolean>) => {
            if (message.author.bot || !message.inGuild() || !(message instanceof Message<true>)) return;
            if (!message.content.startsWith('!')) {
                await this.tryHandleEmote(message);
                return;
            }
            if (!message.member?.voice.channel) {
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
            const cmdArgs = message.content.substring(1).split(' ');
            log.info(`${cmdArgs[0]} command received!`);

            const prefixCommand = Commands.find((c) => c.data.name === cmdArgs[0]);
            if (!prefixCommand) {
                log.info(`Ignoring unknown cmd ${cmdArgs[0]}`);
                return;
            }

            try {
                await prefixCommand.executeMessage(botShim, message, cmdArgs.slice(1));
            } catch (e) {
                await message.reply({
                    content: `An error occurred ${e}`,
                });
            }
        });
    }

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
