// The Command contract every user-facing feature implements, plus the BotShim dependency bag
// passed into every handler. BotShim is named "shim" because it's a narrow projection of the
// Botnek class — handlers get the maps and config they need without a back-reference to the
// full Bot, which keeps command modules trivially testable.

import { ChatInputCommandInteraction, Client, Message, SharedSlashCommand } from 'discord.js';
import AudioHandler from '../audio/audioHandler';
import { ClaudeConversation } from '../commands/claude';
import BetterTTVEmoteGateway from '../commands/emotes/betterTTVEmoteGateway';
import SevenTVEmoteGateway from '../commands/emotes/sevenTVEmoteGateway';
import GuildDatabase from '../data/db';
import { BotnekConfig } from './config';
import GuildResource from './guildResource';

/**
 * Dependency bag threaded through every command handler. Treat the shape as stable —
 * adding a new per-request dependency means editing this interface AND the literal in
 * `Botnek.makeBotShim` in src/bot.ts.
 *
 * Per-guild isolation invariant: any mutable state that belongs to a single guild must live
 * inside one of these `GuildResource<...>` maps, keyed by `interaction.guildId` /
 * `message.guildId`. Module-scope `let`s keyed implicitly by "the current request" are a bug
 * waiting to happen as soon as a second guild calls the same command.
 */
export interface BotShim {
    client: Client;
    config: BotnekConfig;
    audioHandlers: GuildResource<AudioHandler>;
    databases: GuildResource<GuildDatabase>;
    // Stateless external-API clients; one shared pair across all guilds is fine and is what
    // src/bot.ts constructs. Don't move these into a GuildResource.
    emoteGateways: {
        bttvGateway: BetterTTVEmoteGateway;
        sevenTvGateway: SevenTVEmoteGateway;
    };
    claudeConversations: GuildResource<ClaudeConversation>;
}

/**
 * One entry per user-facing command. Both `executeCommand` (slash) and `executeMessage`
 * (`!`-prefix) are required: every command supports both invocation styles, typically by
 * extracting args from each surface and delegating to a shared helper.
 *
 * - `data`: the discord.js SlashCommandBuilder output. Defines the slash schema sent to
 *   Discord during the per-guild REST publish on clientReady.
 * - `helpText`: optional. If present, the command appears in `/help`'s embed and in the
 *   bot-managed `#botnek2-help` channel. Commands without helpText are hidden (e.g. `/help`
 *   itself, to avoid recursion).
 * - `requireUserInChannel`: prefix-route-only voice-channel gate, enforced in src/bot.ts
 *   before dispatch. Slash handlers enforce this themselves so they can use ephemeral
 *   replies and avoid spamming the channel.
 */
export interface Command {
    data: SharedSlashCommand;
    helpText?: string;
    executeCommand: (
        bot: BotShim,
        interaction: ChatInputCommandInteraction<'cached'>,
    ) => Promise<void>;
    executeMessage: (bot: BotShim, message: Message<true>, args: string[]) => Promise<void>;
    requireUserInChannel?: boolean;
}
