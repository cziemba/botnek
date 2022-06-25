import { Client, CommandInteraction, Message } from 'discord.js';
import GuildResource from './guildResource.js';
import AudioHandler from '../audio/audioHandler.js';
import GuildDatabase from '../data/db.js';
import { BotnekConfig } from './config.js';
import BetterTTVEmoteGateway from '../commands/emotes/betterTTVEmoteGateway.js';
import SevenTVEmoteGateway from '../commands/emotes/sevenTVEmoteGateway.js';

export interface BotShim {
    client: Client,
    config: BotnekConfig,
    audioHandlers: GuildResource<AudioHandler>,
    databases: GuildResource<GuildDatabase>,
    emoteGateways: {
        bttvGateway: BetterTTVEmoteGateway,
        sevenTvGateway: SevenTVEmoteGateway,
    }
}

export interface Command {
    data: any;
    helpText?: string;
    executeCommand: (bot: BotShim, interaction: CommandInteraction<'cached'>) => void;
    executeMessage: (bot: BotShim, message: Message<true>, args: string[]) => void;
}
