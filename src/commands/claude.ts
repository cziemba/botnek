// `/claude` — Anthropic SDK passthrough that replaced the deprecated reverse-engineered
// `chatgpt` package. Conversation state is keyed PER GUILD via `bot.claudeConversations`
// (a GuildResource), NOT at module scope — the predecessor `chatgpt.ts` violated this and
// every guild ended up sharing a single rolling conversation. The only module-scope state
// here is `cachedClient`, which is intentional: it's a stateless API client tied to the
// bot's single anthropicApiKey, not to any guild's conversation.

import Anthropic from '@anthropic-ai/sdk';
import { SlashCommandBuilder } from '@discordjs/builders';
import { Attachment, ChatInputCommandInteraction, CommandInteraction, Message } from 'discord.js';
import log from '../logging/logging';
import { BotShim, Command } from '../types/command';

// Conversation expires after this much idle time. Pulled forward on every successful turn,
// so an active back-and-forth never times out mid-thread.
const CONVERSATION_TTL_MS = 5 * 60 * 1000;
const DISCORD_MAX_MESSAGE_LENGTH = 2000;
const DEFAULT_MODEL_ALIAS: ModelAlias = 'opus';
const DEFAULT_EFFORT: EffortLevel = 'medium';
const MAX_TOKENS = 4096;

// Aliases shown in the slash-option dropdown -> exact model IDs. Keep the alias surface
// stable even when bumping point releases — users build muscle memory on the short names.
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

// Module-scope client cache. Safe because the Anthropic SDK client is stateless w.r.t. the
// caller's identity — only the apiKey matters, and bot.config.anthropicApiKey is fixed for
// the process lifetime. The `cachedApiKey` check exists so a future hot-reload of config
// would still rebuild the client.
let cachedClient: Anthropic | null = null;
let cachedApiKey: string | null = null;

function getClient(apiKey: string): Anthropic {
    if (!cachedClient || cachedApiKey !== apiKey) {
        cachedClient = new Anthropic({ apiKey });
        cachedApiKey = apiKey;
    }
    return cachedClient;
}

// Returns the live conversation if it's still within TTL, otherwise resets the message
// history while preserving the guild's configured systemPrompt. systemPrompt survives TTL
// expiry because it's user-configured server-flavor text — wiping it on every idle timeout
// would surprise admins.
function getOrResetConversation(bot: BotShim, guildId: string): ClaudeConversation {
    const conversations = bot.claudeConversations;
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

// Discord caps individual messages at 2000 chars. Prefer breaking on a newline to avoid
// splitting mid-word / mid-code-block; fall back to a hard cut if there's no newline in
// range. Exported for the colocated tests.
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

// Reply path is split because slash interactions and prefix messages have different surfaces:
// slash uses reply/editReply/followUp on a 15-min interaction token (and we may have already
// deferReply'd above), prefix uses a normal channel.send for everything past the first reply.
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

// Effort -> thinking-config mapping. `low` returns undefined (no `thinking` field at all,
// for cheapest/fastest replies); `medium` uses `adaptive` so the model picks a budget per
// query; `high`/`max` pin explicit budgets when the user wants a hard floor on reasoning.
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

// Pass image attachments to Claude as URL-source blocks (not bytes) — the Anthropic SDK
// fetches them server-side, which is faster than us round-tripping the gif through Node and
// uploading bytes. We filter on contentType so non-image attachments (audio, pdf, etc.)
// don't get sent as broken image references.
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
        // Defer up front so the 3-second interaction-ack window doesn't expire while the API
        // call is in flight. Subsequent sendChunks will see deferred=true and editReply.
        await interaction.deferReply();
    }

    const { guildId } = interaction;
    const conversation = getOrResetConversation(bot, guildId);
    const images = opts.images ?? [];
    const userContent = buildUserContent(opts.prompt, images);
    conversation.messages.push({ role: 'user', content: userContent });

    const modelId = MODEL_BY_ALIAS[opts.modelAlias ?? DEFAULT_MODEL_ALIAS];
    const thinking = thinkingFor(opts.effort ?? DEFAULT_EFFORT);

    // Mark the system block ephemeral-cacheable so repeat /claude calls within ~5 minutes
    // hit the prompt cache instead of re-billing the system tokens. Only meaningful when a
    // systemPrompt is configured — without one there's no stable prefix to cache.
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

        // Log usage at debug so it's easy to grep for cache_read_input_tokens > 0 to verify
        // the ephemeral system-prompt cache is actually hitting.
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
        // Roll the failed user turn back out of the conversation so the next attempt isn't
        // pre-poisoned with a dangling user message that has no assistant reply.
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

// Pull image attachments from both the message itself AND any message it's replying to —
// Discord delivers `reference.messageId` for replies, and the natural ergonomic move (reply
// to a screenshot, then `!claude what is this`) needs the referenced attachment to flow
// through. Falls back to the message cache; uncached older replies will simply have no
// referenced images attached.
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
    const conversations = bot.claudeConversations;
    const { guildId } = interaction;
    if (conversations.has(guildId)) {
        // Replace, don't mutate-in-place: the existing object's expiry would otherwise
        // outlive its now-empty messages array, which is harmless but confusing.
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
    const conversations = bot.claudeConversations;
    const { guildId } = interaction;
    // Sentinel value `clear` (case-insensitive) instead of a separate /claude system clear
    // subcommand — keeps the slash schema flat and matches what users will guess to type.
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
    // The prefix path collapses everything except `reset` into an `ask` — there's no
    // ergonomic prefix syntax for the model/effort options, so they're slash-only by design.
    executeMessage: async (bot, message, args) => {
        if (args[0] === 'reset') {
            const conversations = bot.claudeConversations;
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
