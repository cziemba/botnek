import {
    BaseCommandInteraction, Client,
} from 'discord.js';
import GuildResource from './guildResource.js';
import AudioHandler from '../audio/audioHandler.js';
import GuildDatabase from '../data/db.js';
import { BotnekConfig } from './config.js';

export interface BotShim {
    client: Client,
    config: BotnekConfig,
    audioHandlers: GuildResource<AudioHandler>,
    databases: GuildResource<GuildDatabase>
}

export interface Command {
    data: any;
    helpText?: string;
    execute: (bot: BotShim, interaction: BaseCommandInteraction) => void;
}
