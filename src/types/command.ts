import { ChatInputCommandInteraction, Client, Message, SharedSlashCommand } from 'discord.js';
import AudioHandler from '../audio/audioHandler';
import BetterTTVEmoteGateway from '../commands/emotes/betterTTVEmoteGateway';
import SevenTVEmoteGateway from '../commands/emotes/sevenTVEmoteGateway';
import GuildDatabase from '../data/db';
import { BotnekConfig } from './config';
import GuildResource from './guildResource';

export interface BotShim {
    client: Client;
    config: BotnekConfig;
    audioHandlers: GuildResource<AudioHandler>;
    databases: GuildResource<GuildDatabase>;
    emoteGateways: {
        bttvGateway: BetterTTVEmoteGateway;
        sevenTvGateway: SevenTVEmoteGateway;
    };
}

/**
 *
 */
export interface Command {
    data: SharedSlashCommand;
    helpText?: string;
    /**
     * Slash command hook, implementation is required as all commands are slash-commands by default.
     */
    executeCommand: (
        bot: BotShim,
        interaction: ChatInputCommandInteraction<'cached'>,
    ) => Promise<void>;
    /**
     * Message prefix hook, implemen
     * @param bot
     * @param message
     * @param args
     */
    executeMessage: (bot: BotShim, message: Message<true>, args: string[]) => Promise<void>;
    requireUserInChannel?: boolean;
}
