import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import log from '../logging/logging';
import { BotShim } from '../types/command';
import GuildResource from '../types/guildResource';

vi.mock('@anthropic-ai/sdk', () => {
    class MockAPIError extends Error {
        constructor(message: string) {
            super(message);
            this.name = 'APIError';
        }
    }
    const messagesCreate = vi.fn();
    function Anthropic(this: any) {
        this.messages = { create: messagesCreate };
    }
    (Anthropic as any).APIError = MockAPIError;
    // Stash on globalThis so tests can grab the mock fn / error class.
    (globalThis as any).__anthropicMessagesCreate = messagesCreate;
    (globalThis as any).__anthropicAPIError = MockAPIError;
    return { default: Anthropic };
});

import Claude, { chunkForDiscord, ClaudeConversation, errorMessage } from './claude';

const messagesCreate = (globalThis as any).__anthropicMessagesCreate as Mock;
const MockAPIError = (globalThis as any).__anthropicAPIError as new (msg: string) => Error;

interface RecordedReply {
    content: string;
}

function makeReplies(): {
    record: RecordedReply[];
    reply: Mock;
    editReply: Mock;
    followUp: Mock;
    deferReply: Mock;
} {
    const record: RecordedReply[] = [];
    const reply = vi.fn(async (opts: RecordedReply) => {
        record.push(opts);
    });
    const editReply = vi.fn(async (opts: RecordedReply) => {
        record.push(opts);
    });
    const followUp = vi.fn(async (opts: RecordedReply) => {
        record.push(opts);
    });
    const deferReply = vi.fn(async () => {});
    return { record, reply, editReply, followUp, deferReply };
}

function makeMessage(guildId: string, content: string, attachments: any[] = []): any {
    const send = vi.fn();
    const replies = makeReplies();
    return {
        guildId,
        content,
        reference: undefined,
        attachments: { values: () => attachments[Symbol.iterator]() } as any,
        channel: { send, messages: { cache: new Map() } },
        reply: replies.reply,
        _replies: replies,
    };
}

function makeShim(
    opts: {
        apiKey?: string;
        conversations?: GuildResource<ClaudeConversation>;
    } = {},
): BotShim {
    return {
        client: {} as any,
        config: { token: 't', dataRoot: '/tmp', anthropicApiKey: opts.apiKey ?? 'test-key' },
        audioHandlers: new GuildResource(),
        databases: new GuildResource(),
        emoteGateways: { bttvGateway: {} as any, sevenTvGateway: {} as any },
        claudeConversations: opts.conversations ?? new GuildResource<ClaudeConversation>(),
    };
}

function okResponse(text = 'hello') {
    return {
        content: [{ type: 'text', text }],
        usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
        },
    };
}

beforeEach(() => {
    messagesCreate.mockReset();
    vi.useRealTimers();
});

describe('chunkForDiscord', () => {
    it('returns single chunk under limit', () => {
        const chunks = chunkForDiscord('hello');
        expect(chunks).toEqual(['hello']);
    });

    it('returns single chunk at exact 2000 boundary', () => {
        const text = 'a'.repeat(2000);
        const chunks = chunkForDiscord(text);
        expect(chunks).toEqual([text]);
    });

    it('splits when 1 char over limit', () => {
        const text = 'a'.repeat(2001);
        const chunks = chunkForDiscord(text);
        expect(chunks).toHaveLength(2);
        expect(chunks[0]).toHaveLength(2000);
        expect(chunks[1]).toBe('a');
    });

    it('produces three chunks at 4001 chars', () => {
        const text = 'a'.repeat(4001);
        const chunks = chunkForDiscord(text);
        expect(chunks).toHaveLength(3);
        expect(chunks[0].length + chunks[1].length + chunks[2].length).toBe(4001);
        expect(chunks[2]).toBe('a');
    });

    it('breaks at last newline before the limit', () => {
        const a = 'a'.repeat(1500);
        const b = 'b'.repeat(800);
        const chunks = chunkForDiscord(`${a}\n${b}`);
        expect(chunks).toEqual([a, b]);
    });

    it('preserves multi-newline boundaries', () => {
        const a = 'a'.repeat(1000);
        const b = 'b'.repeat(1500);
        const chunks = chunkForDiscord(`${a}\n\n${b}`);
        expect(chunks).toHaveLength(2);
        expect(chunks[0]).toBe(`${a}\n`);
        expect(chunks[1]).toBe(b);
    });

    it('returns empty for empty string', () => {
        expect(chunkForDiscord('')).toEqual([]);
    });
});

describe('errorMessage', () => {
    it('formats Anthropic.APIError', () => {
        const e = new MockAPIError('rate limited');
        expect(errorMessage(e)).toBe('APIError: rate limited');
    });

    it('returns generic Error message', () => {
        expect(errorMessage(new Error('boom'))).toBe('boom');
    });

    it('handles unknown error shape', () => {
        expect(errorMessage('plain string')).toBe('unknown error');
        expect(errorMessage(undefined)).toBe('unknown error');
        expect(errorMessage({ foo: 'bar' })).toBe('unknown error');
    });
});

describe('Claude prefix command (executeMessage)', () => {
    it('isolates conversations per guild', async () => {
        const seenLengths: number[] = [];
        messagesCreate.mockImplementation(async (req: any) => {
            seenLengths.push(req.messages.length);
            return okResponse(`reply-${req.messages.length}`);
        });
        const conversations = new GuildResource<ClaudeConversation>();
        const shim = makeShim({ conversations });

        const msgA = makeMessage('guild-A', '!claude hi from A');
        const msgB = makeMessage('guild-B', '!claude hi from B');

        await Claude.executeMessage(shim, msgA, ['hi', 'from', 'A']);
        await Claude.executeMessage(shim, msgB, ['hi', 'from', 'B']);

        const convA = conversations.get('guild-A');
        const convB = conversations.get('guild-B');
        expect(convA.messages).toHaveLength(2);
        expect(convB.messages).toHaveLength(2);
        expect(convA.messages[0]).toEqual({ role: 'user', content: 'hi from A' });
        expect(convB.messages[0]).toEqual({ role: 'user', content: 'hi from B' });
        // Both calls saw a single user message — no cross-contamination between guilds.
        expect(messagesCreate).toHaveBeenCalledTimes(2);
        expect(seenLengths).toEqual([1, 1]);
    });

    it('expires after 5 minute TTL and starts fresh conversation', async () => {
        const seenLengths: number[] = [];
        messagesCreate.mockImplementation(async (req: any) => {
            seenLengths.push(req.messages.length);
            return okResponse('ok');
        });
        const conversations = new GuildResource<ClaudeConversation>();
        const shim = makeShim({ conversations });

        const msg1 = makeMessage('g1', '!claude one');
        await Claude.executeMessage(shim, msg1, ['one']);
        expect(conversations.get('g1').messages).toHaveLength(2);

        // Force expiry
        conversations.get('g1').expiry = Date.now() - 1;

        const msg2 = makeMessage('g1', '!claude two');
        await Claude.executeMessage(shim, msg2, ['two']);

        // Fresh conversation: only the new round (1 user + 1 assistant).
        expect(conversations.get('g1').messages).toHaveLength(2);
        expect(conversations.get('g1').messages[0]).toEqual({ role: 'user', content: 'two' });
        // The second API call saw a single-message history (fresh).
        expect(seenLengths).toEqual([1, 1]);
    });

    it('reset prefix clears the conversation', async () => {
        messagesCreate.mockResolvedValueOnce(okResponse('hi'));
        const conversations = new GuildResource<ClaudeConversation>();
        const shim = makeShim({ conversations });

        await Claude.executeMessage(shim, makeMessage('g1', '!claude one'), ['one']);
        expect(conversations.get('g1').messages).toHaveLength(2);

        const resetMsg = makeMessage('g1', '!claude reset');
        await Claude.executeMessage(shim, resetMsg, ['reset']);

        expect(conversations.get('g1').messages).toEqual([]);
        expect(resetMsg._replies.record[0].content).toMatch(/cleared/);
    });

    it('prefix passes image attachments as image content blocks', async () => {
        messagesCreate.mockResolvedValueOnce(okResponse('saw image'));
        const conversations = new GuildResource<ClaudeConversation>();
        const shim = makeShim({ conversations });

        const msg = makeMessage('g1', '!claude what is this', [
            { url: 'https://example.com/cat.png', contentType: 'image/png' },
            { url: 'https://example.com/doc.pdf', contentType: 'application/pdf' },
        ]);

        await Claude.executeMessage(shim, msg, ['what', 'is', 'this']);

        const sentMessages = messagesCreate.mock.calls[0][0].messages;
        const userContent = sentMessages[0].content;
        expect(Array.isArray(userContent)).toBe(true);
        const imageBlocks = userContent.filter((b: any) => b.type === 'image');
        expect(imageBlocks).toHaveLength(1);
        expect(imageBlocks[0]).toEqual({
            type: 'image',
            source: { type: 'url', url: 'https://example.com/cat.png' },
        });
        const textBlocks = userContent.filter((b: any) => b.type === 'text');
        expect(textBlocks).toHaveLength(1);
        expect(textBlocks[0].text).toBe('what is this');
    });

    it('logs token usage at debug level', async () => {
        const debugSpy = vi.spyOn(log, 'debug');
        messagesCreate.mockResolvedValueOnce({
            content: [{ type: 'text', text: 'ok' }],
            usage: {
                input_tokens: 100,
                output_tokens: 50,
                cache_read_input_tokens: 25,
                cache_creation_input_tokens: 75,
            },
        });
        const shim = makeShim();
        await Claude.executeMessage(shim, makeMessage('g1', '!claude hi'), ['hi']);

        const usageLogCall = debugSpy.mock.calls.find(
            (call) => typeof call[1] === 'string' && call[1].includes('Claude API usage'),
        );
        expect(usageLogCall).toBeDefined();
        const payload = usageLogCall![0] as any;
        expect(payload.input_tokens).toBe(100);
        expect(payload.output_tokens).toBe(50);
        expect(payload.cache_read_input_tokens).toBe(25);
        expect(payload.cache_creation_input_tokens).toBe(75);
        debugSpy.mockRestore();
    });
});

describe('Claude slash command (executeCommand)', () => {
    function makeInteraction(opts: {
        guildId: string;
        sub: string;
        getString?: Record<string, string | null>;
    }): any {
        const replies = makeReplies();
        return {
            guildId: opts.guildId,
            deferred: false,
            replied: false,
            options: {
                getSubcommand: () => opts.sub,
                getString: (name: string, _required?: boolean) => opts.getString?.[name] ?? null,
            },
            reply: replies.reply,
            editReply: replies.editReply,
            followUp: replies.followUp,
            deferReply: vi.fn(async () => {
                replies.deferReply();
            }),
            _replies: replies,
        };
    }

    it('reset subcommand clears conversation but preserves systemPrompt', async () => {
        messagesCreate.mockResolvedValueOnce(okResponse('first'));
        const conversations = new GuildResource<ClaudeConversation>();
        const shim = makeShim({ conversations });

        await Claude.executeMessage(shim, makeMessage('g1', '!claude hi'), ['hi']);
        conversations.get('g1').systemPrompt = 'be a pirate';
        expect(conversations.get('g1').messages).toHaveLength(2);

        const interaction = makeInteraction({ guildId: 'g1', sub: 'reset' });
        await Claude.executeCommand(shim, interaction);

        expect(conversations.get('g1').messages).toEqual([]);
        expect(conversations.get('g1').systemPrompt).toBe('be a pirate');
        expect(interaction._replies.record[0].content).toMatch(/cleared/);
    });

    it('system subcommand sets system prompt and it is sent on next call', async () => {
        const conversations = new GuildResource<ClaudeConversation>();
        const shim = makeShim({ conversations });

        const sysInteraction = makeInteraction({
            guildId: 'g1',
            sub: 'system',
            getString: { prompt: 'you are a sarcastic pirate' },
        });
        await Claude.executeCommand(shim, sysInteraction);
        expect(conversations.get('g1').systemPrompt).toBe('you are a sarcastic pirate');

        messagesCreate.mockResolvedValueOnce(okResponse('arr'));
        await Claude.executeMessage(shim, makeMessage('g1', '!claude ahoy'), ['ahoy']);

        const sentSystem = messagesCreate.mock.calls[0][0].system;
        expect(sentSystem).toEqual([
            {
                type: 'text',
                text: 'you are a sarcastic pirate',
                cache_control: { type: 'ephemeral' },
            },
        ]);
    });

    it('system clear removes the system prompt', async () => {
        const conversations = new GuildResource<ClaudeConversation>();
        const shim = makeShim({ conversations });

        const setInteraction = makeInteraction({
            guildId: 'g1',
            sub: 'system',
            getString: { prompt: 'be helpful' },
        });
        await Claude.executeCommand(shim, setInteraction);

        const clearInteraction = makeInteraction({
            guildId: 'g1',
            sub: 'system',
            getString: { prompt: 'clear' },
        });
        await Claude.executeCommand(shim, clearInteraction);

        expect(conversations.get('g1').systemPrompt).toBeUndefined();
    });

    it('ask uses opus + adaptive thinking by default', async () => {
        messagesCreate.mockResolvedValueOnce(okResponse('hi'));
        const shim = makeShim();

        const interaction = makeInteraction({
            guildId: 'g1',
            sub: 'ask',
            getString: { text: 'hello' },
        });
        await Claude.executeCommand(shim, interaction);

        const call = messagesCreate.mock.calls[0][0];
        expect(call.model).toBe('claude-opus-4-7');
        expect(call.thinking).toEqual({ type: 'adaptive' });
    });

    it('maps model + effort options', async () => {
        const cases: {
            model: string;
            effort: string;
            expectedModel: string;
            expectedThinking: any;
        }[] = [
            {
                model: 'sonnet',
                effort: 'low',
                expectedModel: 'claude-sonnet-4-6',
                expectedThinking: undefined,
            },
            {
                model: 'haiku',
                effort: 'high',
                expectedModel: 'claude-haiku-4-5-20251001',
                expectedThinking: { type: 'enabled', budget_tokens: 8192 },
            },
            {
                model: 'opus',
                effort: 'max',
                expectedModel: 'claude-opus-4-7',
                expectedThinking: { type: 'enabled', budget_tokens: 16384 },
            },
        ];

        for (const c of cases) {
            messagesCreate.mockResolvedValueOnce(okResponse('hi'));
            const shim = makeShim();
            const interaction = makeInteraction({
                guildId: `g-${c.model}-${c.effort}`,
                sub: 'ask',
                getString: { text: 'hello', model: c.model, effort: c.effort },
            });
            await Claude.executeCommand(shim, interaction);

            const call = messagesCreate.mock.calls.at(-1)![0];
            expect(call.model).toBe(c.expectedModel);
            expect(call.thinking).toEqual(c.expectedThinking);
        }
    });

    it('ask passes image option as URL image block', async () => {
        messagesCreate.mockResolvedValueOnce(okResponse('saw it'));
        const shim = makeShim();
        const interaction = makeInteraction({
            guildId: 'g1',
            sub: 'ask',
            getString: { text: 'what?', image: 'https://example.com/x.png' },
        });
        await Claude.executeCommand(shim, interaction);

        const call = messagesCreate.mock.calls[0][0];
        const userContent = call.messages[0].content;
        expect(userContent).toEqual([
            { type: 'image', source: { type: 'url', url: 'https://example.com/x.png' } },
            { type: 'text', text: 'what?' },
        ]);
    });
});
