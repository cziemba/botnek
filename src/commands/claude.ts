import { SlashCommandBuilder } from '@discordjs/builders';
import Anthropic from '@anthropic-ai/sdk';
import { CommandInteraction, Message } from 'discord.js';
import log from '../logging/logging';
import { BotShim, Command } from '../types/command';

const CONVERSATION_TTL_MS = 5 * 60 * 1000;
const DISCORD_MAX_MESSAGE_LENGTH = 2000;
const MODEL = 'claude-opus-4-7';
const MAX_TOKENS = 4096;

interface GuildConversation {
    messages: Anthropic.MessageParam[];
    expiry: number;
}

const conversationsByGuild = new Map<string, GuildConversation>();
let cachedClient: Anthropic | null = null;
let cachedApiKey: string | null = null;

function getClient(apiKey: string): Anthropic {
    if (!cachedClient || cachedApiKey !== apiKey) {
        cachedClient = new Anthropic({ apiKey });
        cachedApiKey = apiKey;
    }
    return cachedClient;
}

function getOrResetConversation(guildId: string): GuildConversation {
    const existing = conversationsByGuild.get(guildId);
    if (existing && existing.expiry > Date.now()) {
        return existing;
    }
    const fresh: GuildConversation = {
        messages: [],
        expiry: Date.now() + CONVERSATION_TTL_MS,
    };
    conversationsByGuild.set(guildId, fresh);
    return fresh;
}

function chunkForDiscord(text: string): string[] {
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > DISCORD_MAX_MESSAGE_LENGTH) {
        let cutAt = remaining.lastIndexOf('\n', DISCORD_MAX_MESSAGE_LENGTH);
        if (cutAt <= 0) cutAt = DISCORD_MAX_MESSAGE_LENGTH;
        chunks.push(remaining.slice(0, cutAt));
        remaining = remaining.slice(cutAt).replace(/^\n/, '');
    }
    if (remaining.length > 0) chunks.push(remaining);
    return chunks;
}

async function sendChunks(
    interaction: CommandInteraction<'cached'> | Message<true>,
    chunks: string[],
): Promise<void> {
    if (chunks.length === 0) return;
    const [first, ...rest] = chunks;
    if (interaction instanceof CommandInteraction) {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: first });
        } else {
            await interaction.reply({ content: first });
        }
        for (const chunk of rest) {
            await interaction.followUp({ content: chunk });
        }
    } else {
        await interaction.reply({ content: first });
        for (const chunk of rest) {
            await interaction.channel.send({ content: chunk });
        }
    }
}

function errorMessage(e: unknown): string {
    if (e instanceof Anthropic.APIError) return `${e.name}: ${e.message}`;
    if (e instanceof Error) return e.message;
    return 'unknown error';
}

async function claudeChat(
    bot: BotShim,
    interaction: CommandInteraction<'cached'> | Message<true>,
    prompt: string,
): Promise<void> {
    const apiKey = bot.config.anthropicApiKey;
    if (!apiKey) {
        await sendChunks(interaction, [
            'Claude is not configured (missing `anthropicApiKey` in config).',
        ]);
        return;
    }

    if (interaction instanceof CommandInteraction) {
        await interaction.deferReply();
    }

    const { guildId } = interaction;
    const conversation = getOrResetConversation(guildId);
    conversation.messages.push({ role: 'user', content: prompt });

    try {
        const response = await getClient(apiKey).messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            thinking: { type: 'adaptive' },
            messages: conversation.messages,
        });

        conversation.messages.push({ role: 'assistant', content: response.content });
        conversation.expiry = Date.now() + CONVERSATION_TTL_MS;

        const text = response.content
            .filter((block): block is Anthropic.TextBlock => block.type === 'text')
            .map((block) => block.text)
            .join('\n');

        if (!text) {
            await sendChunks(interaction, ['Claude responded with no text.']);
            return;
        }

        await sendChunks(interaction, chunkForDiscord(text));
    } catch (e) {
        log.error({ err: e }, 'Claude API call failed');
        conversation.messages.pop();
        await sendChunks(interaction, [`Something went wrong: ${errorMessage(e)}`]);
    }
}

const Claude: Command = {
    requireUserInChannel: false,
    data: new SlashCommandBuilder()
        .setName('claude')
        .setDescription('Talk with Claude')
        .addStringOption((text) =>
            text.setName('text').setRequired(true).setDescription('Prompt to send to Claude'),
        ),
    helpText: `
        Chat with Claude (Anthropic). Conversation state is per-guild with a 5-minute idle expiry.
        Usage:
            \`claude <message>\`
        Example:
            \`claude what is the airspeed velocity of an unladen swallow?\`
    `,
    executeCommand: async (bot, interaction) => {
        await claudeChat(bot, interaction, interaction.options.getString('text', true));
    },
    executeMessage: async (bot, message, args) => {
        await claudeChat(bot, message, args.join(' '));
    },
};

export default Claude;
