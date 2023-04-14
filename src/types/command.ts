import { ChatInputCommandInteraction, Client, Message } from 'discord.js';
import GuildResource from './guildResource.ts';
import AudioHandler from '../audio/audioHandler.ts';
import GuildDatabase from '../data/db.ts';
import { BotnekConfig } from './config.ts';
import BetterTTVEmoteGateway from '../commands/emotes/betterTTVEmoteGateway.ts';
import SevenTVEmoteGateway from '../commands/emotes/sevenTVEmoteGateway.ts';

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
    executeCommand: (bot: BotShim, interaction: ChatInputCommandInteraction<'cached'>) => Promise<void>;
    executeMessage: (bot: BotShim, message: Message<true>, args: string[]) => Promise<void>;
    requireUserInChannel?: boolean;
}
