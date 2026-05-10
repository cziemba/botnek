import Anthropic from '@anthropic-ai/sdk';
import { SlashCommandBuilder } from '@discordjs/builders';
import { Attachment, ChatInputCommandInteraction, CommandInteraction, Message } from 'discord.js';
import log from '../logging/logging';
import { BotShim, Command } from '../types/command';
import GuildResource from '../types/guildResource';

// Idle TTL: any guild conversation with no activity for this long is wiped on next call.
const CONVERSATION_TTL_MS = 5 * 60 * 1000;
const DISCORD_MAX_MESSAGE_LENGTH = 2000;
const DEFAULT_MODEL_ALIAS: ModelAlias = 'opus';
const DEFAULT_EFFORT: EffortLevel = 'medium';
const MAX_TOKENS = 4096;

const MODEL_BY_ALIAS = {
    opus: 'claude-opus-4-7',
    sonnet: 'claude-sonnet-4-6',
    haiku: 'claude-haiku-4-5-20251001',
} as const satisfies Record<string, string>;

type ModelAlias = keyof typeof MODEL_BY_ALIAS;
type EffortLevel = 'low' | 'medium' | 'high' | 'max';

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export interface ClaudeConversation {
    messages: Anthropic.MessageParam[];
    expiry: number;
    systemPrompt?: string;
}

let cachedClient: Anthropic | null = null;
let cachedApiKey: string | null = null;

// Fallback resource used only when bot.ts hasn't yet wired BotShim.claudeConversations.
// This module-scoped value is intentionally minimal — the real instance lives on BotShim.
const fallbackConversations = new GuildResource<ClaudeConversation>();

function conversationsFor(bot: BotShim): GuildResource<ClaudeConversation> {
    return bot.claudeConversations ?? fallbackConversations;
}

function getClient(apiKey: string): Anthropic {
    if (!cachedClient || cachedApiKey !== apiKey) {
        cachedClient = new Anthropic({ apiKey });
        cachedApiKey = apiKey;
    }
    return cachedClient;
}

function getOrResetConversation(
    conversations: GuildResource<ClaudeConversation>,
    guildId: string,
): ClaudeConversation {
    if (conversations.has(guildId)) {
        const existing = conversations.get(guildId);
        if (existing.expiry > Date.now()) return existing;
    }
    const previousSystemPrompt = conversations.has(guildId)
        ? conversations.get(guildId).systemPrompt
        : undefined;
    const fresh: ClaudeConversation = {
        messages: [],
        expiry: Date.now() + CONVERSATION_TTL_MS,
        systemPrompt: previousSystemPrompt,
    };
    conversations.put(guildId, fresh);
    return fresh;
}

export function chunkForDiscord(text: string): string[] {
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

export function errorMessage(e: unknown): string {
    if (e instanceof Anthropic.APIError) return `${e.name}: ${e.message}`;
    if (e instanceof Error) return e.message;
    return 'unknown error';
}

function thinkingFor(effort: EffortLevel): Anthropic.ThinkingConfigParam | undefined {
    switch (effort) {
        case 'low':
            return undefined;
        case 'medium':
            return { type: 'adaptive' };
        case 'high':
            return { type: 'enabled', budget_tokens: 8192 };
        case 'max':
            return { type: 'enabled', budget_tokens: 16384 };
    }
}

function imageBlocksFromAttachments(attachments: Attachment[]): Anthropic.ImageBlockParam[] {
    return attachments
        .filter((a) => a.contentType && IMAGE_MIME_TYPES.has(a.contentType))
        .map((a) => ({
            type: 'image',
            source: { type: 'url', url: a.url },
        }));
}

function buildUserContent(
    prompt: string,
    images: Anthropic.ImageBlockParam[],
): string | Anthropic.ContentBlockParam[] {
    if (images.length === 0) return prompt;
    return [...images, { type: 'text', text: prompt }];
}

interface ChatOptions {
    prompt: string;
    images?: Anthropic.ImageBlockParam[];
    modelAlias?: ModelAlias;
    effort?: EffortLevel;
}

async function claudeChat(
    bot: BotShim,
    interaction: CommandInteraction<'cached'> | Message<true>,
    opts: ChatOptions,
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
    const conversation = getOrResetConversation(conversationsFor(bot), guildId);
    const images = opts.images ?? [];
    const userContent = buildUserContent(opts.prompt, images);
    conversation.messages.push({ role: 'user', content: userContent });

    const modelId = MODEL_BY_ALIAS[opts.modelAlias ?? DEFAULT_MODEL_ALIAS];
    const thinking = thinkingFor(opts.effort ?? DEFAULT_EFFORT);

    // ephemeral cache_control on the system block makes prompt-cache hits real
    // for repeat calls within the cache window (~5 min).
    let system: Anthropic.TextBlockParam[] | undefined;
    if (conversation.systemPrompt) {
        system = [
            {
                type: 'text',
                text: conversation.systemPrompt,
                cache_control: { type: 'ephemeral' },
            },
        ];
    }

    try {
        const response = await getClient(apiKey).messages.create({
            model: modelId,
            max_tokens: MAX_TOKENS,
            ...(thinking ? { thinking } : {}),
            ...(system ? { system } : {}),
            messages: conversation.messages,
        });

        const usage = response.usage;
        log.debug(
            {
                input_tokens: usage.input_tokens,
                output_tokens: usage.output_tokens,
                cache_read_input_tokens: usage.cache_read_input_tokens,
                cache_creation_input_tokens: usage.cache_creation_input_tokens,
                model: modelId,
            },
            'Claude API usage',
        );

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

function parseModelAlias(value: string | null): ModelAlias | undefined {
    if (value === 'opus' || value === 'sonnet' || value === 'haiku') return value;
    return undefined;
}

function parseEffort(value: string | null): EffortLevel | undefined {
    if (value === 'low' || value === 'medium' || value === 'high' || value === 'max') return value;
    return undefined;
}

function imagesFromMessage(message: Message<true>): Anthropic.ImageBlockParam[] {
    const own = imageBlocksFromAttachments([...message.attachments.values()]);
    const referencedId = message.reference?.messageId;
    const referencedAttachments = referencedId
        ? (message.channel.messages.cache.get(referencedId)?.attachments.values() ?? [])
        : [];
    const referenced = imageBlocksFromAttachments([...referencedAttachments]);
    return [...own, ...referenced];
}

async function handleAsk(
    bot: BotShim,
    interaction: ChatInputCommandInteraction<'cached'>,
): Promise<void> {
    const prompt = interaction.options.getString('text', true);
    const modelAlias = parseModelAlias(interaction.options.getString('model', false));
    const effort = parseEffort(interaction.options.getString('effort', false));
    const imageUrl = interaction.options.getString('image', false);
    const images: Anthropic.ImageBlockParam[] = imageUrl
        ? [{ type: 'image', source: { type: 'url', url: imageUrl } }]
        : [];
    await claudeChat(bot, interaction, { prompt, images, modelAlias, effort });
}

async function handleReset(
    bot: BotShim,
    interaction: ChatInputCommandInteraction<'cached'>,
): Promise<void> {
    const conversations = conversationsFor(bot);
    const { guildId } = interaction;
    if (conversations.has(guildId)) {
        const existing = conversations.get(guildId);
        conversations.put(guildId, {
            messages: [],
            expiry: Date.now() + CONVERSATION_TTL_MS,
            systemPrompt: existing.systemPrompt,
        });
    }
    await interaction.reply({ content: 'Claude conversation cleared.' });
}

async function handleSystem(
    bot: BotShim,
    interaction: ChatInputCommandInteraction<'cached'>,
): Promise<void> {
    const prompt = interaction.options.getString('prompt', true);
    const conversations = conversationsFor(bot);
    const { guildId } = interaction;
    if (prompt.trim().toLowerCase() === 'clear') {
        if (conversations.has(guildId)) {
            const existing = conversations.get(guildId);
            existing.systemPrompt = undefined;
        }
        await interaction.reply({ content: 'Claude system prompt cleared.' });
        return;
    }
    if (!conversations.has(guildId)) {
        conversations.put(guildId, {
            messages: [],
            expiry: Date.now() + CONVERSATION_TTL_MS,
        });
    }
    conversations.get(guildId).systemPrompt = prompt;
    await interaction.reply({ content: 'Claude system prompt updated.' });
}

const Claude: Command = {
    requireUserInChannel: false,
    data: new SlashCommandBuilder()
        .setName('claude')
        .setDescription('Talk with Claude')
        .addSubcommand((ask) =>
            ask
                .setName('ask')
                .setDescription('Send a prompt to Claude')
                .addStringOption((text) =>
                    text
                        .setName('text')
                        .setRequired(true)
                        .setDescription('Prompt to send to Claude'),
                )
                .addStringOption((image) =>
                    image
                        .setName('image')
                        .setRequired(false)
                        .setDescription('Optional image URL to attach to the prompt'),
                )
                .addStringOption((model) =>
                    model
                        .setName('model')
                        .setRequired(false)
                        .setDescription('Model to use (default: opus)')
                        .addChoices(
                            { name: 'opus', value: 'opus' },
                            { name: 'sonnet', value: 'sonnet' },
                            { name: 'haiku', value: 'haiku' },
                        ),
                )
                .addStringOption((effort) =>
                    effort
                        .setName('effort')
                        .setRequired(false)
                        .setDescription('Thinking effort (default: medium)')
                        .addChoices(
                            { name: 'low', value: 'low' },
                            { name: 'medium', value: 'medium' },
                            { name: 'high', value: 'high' },
                            { name: 'max', value: 'max' },
                        ),
                ),
        )
        .addSubcommand((reset) =>
            reset.setName('reset').setDescription("Clear this guild's Claude conversation"),
        )
        .addSubcommand((system) =>
            system
                .setName('system')
                .setDescription('Set or clear the per-guild system prompt')
                .addStringOption((prompt) =>
                    prompt
                        .setName('prompt')
                        .setRequired(true)
                        .setDescription('System prompt text, or "clear" to remove'),
                ),
        ),
    helpText: `
        Chat with Claude (Anthropic). Conversation state is per-guild with a 5-minute idle expiry.
        Subcommands:
            \`/claude ask <text> [image] [model] [effort]\` — send a prompt
            \`/claude reset\` — clear the conversation
            \`/claude system <prompt|clear>\` — set or clear the system prompt
        Prefix:
            \`!claude <message>\` — equivalent to \`/claude ask\`. Image attachments are passed to Claude.
    `,
    executeCommand: async (bot, interaction) => {
        const sub = interaction.options.getSubcommand(true);
        if (sub === 'ask') {
            await handleAsk(bot, interaction);
        } else if (sub === 'reset') {
            await handleReset(bot, interaction);
        } else if (sub === 'system') {
            await handleSystem(bot, interaction);
        }
    },
    executeMessage: async (bot, message, args) => {
        if (args[0] === 'reset') {
            const conversations = conversationsFor(bot);
            const { guildId } = message;
            if (conversations.has(guildId)) {
                const existing = conversations.get(guildId);
                conversations.put(guildId, {
                    messages: [],
                    expiry: Date.now() + CONVERSATION_TTL_MS,
                    systemPrompt: existing.systemPrompt,
                });
            }
            await message.reply({ content: 'Claude conversation cleared.' });
            return;
        }
        await claudeChat(bot, message, {
            prompt: args.join(' '),
            images: imagesFromMessage(message),
        });
    },
};

export default Claude;
