import { ChatInputCommandInteraction, Client, Message, SharedSlashCommand } from 'discord.js';
import AudioHandler from '../audio/audioHandler.ts';
import BetterTTVEmoteGateway from '../commands/emotes/betterTTVEmoteGateway.ts';
import SevenTVEmoteGateway from '../commands/emotes/sevenTVEmoteGateway.ts';
import GuildDatabase from '../data/db.ts';
import { BotnekConfig } from './config.ts';
import GuildResource from './guildResource.ts';

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
