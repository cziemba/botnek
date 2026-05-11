// Botnek wires up the discord.js Client, owns the per-guild AudioHandler / GuildDatabase /
// ClaudeConversation maps via the BotShim it threads through every handler, and dispatches both
// slash and prefix commands. Per-guild isolation is load-bearing: never store mutable
// command state at module scope keyed implicitly by the current interaction. (See
// docs/staleness.md — `chatgpt.ts` was the historical violator; `claude.ts` keeps state in
// `BotShim.claudeConversations` keyed by guildId.) Emote gateways are constructed once here
// and shared across all guilds — they're stateless lookups against an external API.

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
import AudioHandler from './audio/audioHandler';
import COMMANDS from './commands';
import { ClaudeConversation } from './commands/claude';
import BetterTTVEmoteGateway from './commands/emotes/betterTTVEmoteGateway';
import { findEmoteAliases, handleEmotes, resolveEmoteAliases } from './commands/emotes/emote';
import SevenTVEmoteGateway from './commands/emotes/sevenTVEmoteGateway';
import { helpMsgOptions } from './commands/help';
import GuildDatabase from './data/db';
import EmoteConfigManager from './data/emoteConfigManager';
import log from './logging/logging';
import { BotnekConfig } from './types/config';
import GuildResource from './types/guildResource';

const DB_FILE: string = 'db.json';

export default class Botnek {
    private readonly client: Client;

    private readonly audioHandlers: GuildResource<AudioHandler>;

    private readonly databases: GuildResource<GuildDatabase>;

    private readonly claudeConversations: GuildResource<ClaudeConversation>;

    private readonly config: BotnekConfig;

    private readonly emoteGateways: {
        sevenTvGateway: SevenTVEmoteGateway;
        bttvGateway: BetterTTVEmoteGateway;
    };

    constructor(config: BotnekConfig) {
        this.audioHandlers = new GuildResource<AudioHandler>();
        this.databases = new GuildResource<GuildDatabase>();
        this.claudeConversations = new GuildResource<ClaudeConversation>();
        this.config = config;
        // Gateways are external API clients with no mutable state; one shared pair is enough for
        // every guild. Constructing them per-handler-invocation (the historical pattern) was
        // wasteful with no isolation benefit.
        this.emoteGateways = {
            sevenTvGateway: new SevenTVEmoteGateway(config),
            bttvGateway: new BetterTTVEmoteGateway(config),
        };

        // Intent set is the minimum needed: Guilds for cache/lifecycle, GuildVoiceStates so
        // joinVoiceChannel works, GuildMessages + MessageContent for the `!`-prefix and bare
        // emote-alias paths. MessageContent is a privileged intent and must be enabled in the
        // Discord developer portal.
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
            ],
        });

        // clientReady fires once after gateway connect + initial guild cache hydrate. We do all
        // per-guild bootstrap (resource init, command publish, help-channel upsert) here so that
        // by the time interactionCreate fires, every guild already has its AudioHandler / db.
        this.client.once('clientReady', async () => {
            if (!this.client.user || !this.client.application) {
                return;
            }

            const clientId = this.client.user.id;
            const guilds = Array.from(this.client.guilds.cache.values());

            if (guilds.length === 0) {
                // The bot is guild-scoped — without a guild we have nowhere to register
                // commands and nothing to do. Fail loudly rather than idle silently.
                throw new Error("I'm not in any guilds!, Exiting.");
            }

            const rest = new REST({ version: '10' }).setToken(config.token);

            // Wipe global application commands on every boot. We publish per-guild below
            // (zero propagation delay vs. ~1 hour for global), and any leftover global
            // registrations would show up as duplicate entries in user pickers.
            await rest.put(Routes.applicationCommands(clientId), {
                body: [],
            });

            // Publish commands and stand up resources for every guild concurrently. Each
            // guild's REST PUT is independent; serializing would multiply boot time by
            // guild-count for no benefit.
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

        // Slash command dispatch. Looks up by exact name in the COMMANDS array — adding a new
        // slash command is a one-line registration in src/commands/registry.ts.
        this.client.on('interactionCreate', async (interaction: Interaction<CacheType>) => {
            // Bail on autocomplete, buttons, modals, and uncached guilds — only ChatInput
            // command interactions for guilds we've already initialized are dispatched.
            if (!interaction.isCommand() || !interaction.inCachedGuild()) return;

            log.info(`${interaction.commandName} command received!`);

            const slashCommand = COMMANDS.find((c) => c.data.name === interaction.commandName);
            if (!slashCommand || !(interaction instanceof ChatInputCommandInteraction)) {
                await interaction.reply({
                    content: 'Oops, an error occurred!',
                    ephemeral: true,
                });
                return;
            }

            await slashCommand.executeCommand(this.makeBotShim(), interaction);
        });

        // Prefix-command + bare-emote-alias dispatch. Two paths share this listener because both
        // are MESSAGE_CREATE-driven and we want them consistent (DM-rejection, bot-ignore).
        this.client.on('messageCreate', async (message: Message) => {
            // Drop bot messages (no echo loops) and DMs (the bot is guild-scoped — without a
            // guildId there's no per-guild resource to look up).
            if (message.author.bot || !message.inGuild()) return;
            // Anything that's not an explicit `!`-prefix command might still be a bare emote
            // alias (e.g. typing `pepega` in a channel auto-replaces with the gif via webhook).
            // Try the emote path first; tryHandleEmote no-ops if no aliases match.
            if (!message.content.startsWith('!')) {
                await this.tryHandleEmote(message);
                return;
            }
            const cmdArgs = message.content.substring(1).split(' ');
            log.info(`${cmdArgs[0]} command received!`);

            const prefixCommand = COMMANDS.find((c) => c.data.name === cmdArgs[0]);
            if (!prefixCommand) {
                // Unknown `!`-prefix message — silently ignore. Replying would spam channels
                // any time someone uses `!` for non-bot purposes.
                log.info(`Ignoring unknown cmd ${cmdArgs[0]}`);
                return;
            }

            // Slash commands enforce the voice-channel requirement inside their handler (so
            // they can use ephemeral replies). The prefix path enforces it here so handlers
            // don't have to repeat themselves.
            if (prefixCommand.requireUserInChannel && !message.member?.voice.channel) {
                await message.reply({
                    content: 'You must join a voice channel before sending a command',
                });
                return;
            }

            try {
                await prefixCommand.executeMessage(this.makeBotShim(), message, cmdArgs.slice(1));
            } catch (e) {
                // Prefix path has no built-in error surfacing (no deferReply / followUp); we
                // catch and reply ourselves so failures aren't silently swallowed.
                await message.reply({
                    content: `An error occurred ${e}`,
                });
            }
        });
    }

    // Bare-emote auto-replace path: scan message content for any tokens that match a configured
    // emote alias, then delegate to `handleEmotes` which deletes the original message and
    // reposts via the channel's webhook with the cached gif(s) attached.
    private async tryHandleEmote(message: Message<true>): Promise<void> {
        const manager = new EmoteConfigManager(this.databases.get(message.guildId).db);
        const aliases = findEmoteAliases(message.content, manager);
        if (aliases.length === 0) return;
        await handleEmotes(this.makeBotShim(), message, resolveEmoteAliases(aliases, manager));
    }

    // Build the dependency bag handed to every command handler. A fresh literal per dispatch
    // (rather than a cached field) keeps the shape obvious at the call site — adding a new
    // dependency means editing this method, the BotShim interface, and nothing else.
    private makeBotShim() {
        return {
            client: this.client,
            config: this.config,
            audioHandlers: this.audioHandlers,
            databases: this.databases,
            emoteGateways: this.emoteGateways,
            claudeConversations: this.claudeConversations,
        };
    }

    // Stand up (or refresh permissions on) the `#botnek2-help` channel and post the current
    // help embed there. Idempotent so it's safe to run on every clientReady — the embed is
    // edited in place if a previous bot message exists, or freshly posted otherwise.
    private async initHelpChannel(guild: Guild): Promise<void> {
        const botnekHelpName = 'botnek2-help';
        let botnekHelpChannel = guild.channels.cache
            .filter((c) => c.type === ChannelType.GuildText)
            .map((c) => c as TextChannel)
            .find((c) => c.name === botnekHelpName);

        // Lock the channel down so users can't talk in it (the bot owns the only message).
        // Bot must explicitly grant itself SendMessages because the @everyone deny would
        // otherwise apply to it as well via role inheritance.
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

        // Garbage-collect any stray non-bot messages so the channel always has exactly one
        // message: the current help embed. Important: a server admin could have pinned junk in
        // here, and we want this channel to be cosmetically clean.
        await Promise.all(
            helpChannelMsgs.filter((m) => m.id !== botMsg?.id).map((m) => m.delete()),
        );

        if (!botMsg) {
            log.info('Initializing the help text');
            await botnekHelpChannel.send(helpMsgOptions() as MessageCreateOptions);
            return;
        }
        // Edit-in-place rather than delete + repost so the message permalink stays stable for
        // anyone who's pinned a link to it.
        log.info('Updating the help text');
        await botMsg.edit(helpMsgOptions() as MessageEditOptions);
    }

    // Idempotent per-guild setup. Called from clientReady for known guilds, but kept idempotent
    // so a future "guildCreate" handler (or a manual late-join) could call it without coordinating
    // with the boot path. Synchronous for simplicity — file IO is small and one-shot.
    private initGuildResources(guildId: string, dataRoot: string) {
        if (this.audioHandlers.has(guildId) && this.databases.has(guildId)) {
            return;
        }

        // Per-guild data sits in `${dataRoot}/${guildId}/`. mkdirSync with recursive is safe
        // even if dataRoot itself doesn't exist yet (first run on a fresh host).
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

    // Best-effort graceful teardown. Stop voice connections first (otherwise discord.js's
    // destroy will leave them dangling for ~30s of UDP timeout), then tear down the gateway.
    // lowdb writes are synchronous so they're already on disk by the time we get here.
    public async shutdown(): Promise<void> {
        log.info('Shutting down...');
        for (const handler of this.audioHandlers.values()) {
            handler.stop();
        }
        await this.client.destroy();
    }
}
