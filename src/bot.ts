import { Client, Intents } from 'discord.js';
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
            if (!interaction.isCommand() && !interaction.isContextMenu()) return;

            log.info(`${interaction.commandName} command received!`);

            const slashCommand = Commands.find((c) => c.data.name === interaction.commandName);
            if (!slashCommand) {
                await interaction.followUp({ content: 'Oops, an error occurred!' });
                return;
            }

            await slashCommand.execute(
                {
                    client: this.client,
                    config: this.config,
                    audioHandlers: this.audioHandlers,
                    databases: this.databases,
                },
                interaction,
            );
        });
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
