import { describe, expect, it } from 'vitest';
import { Emote, EmoteSource } from '../data/types/emote';
import { formatEmoteListChunks } from './emote';

const mkEmote = (alias: string): [string, Emote] => [
    alias,
    {
        id: alias.padEnd(16, '0'),
        defaultAlias: alias,
        source: EmoteSource.SEVENTV,
    },
];

describe('formatEmoteListChunks', () => {
    it('returns a placeholder when no emotes are configured', () => {
        expect(formatEmoteListChunks([])).toEqual(['No emotes!']);
    });

    it('emits a single chunk when everything fits', () => {
        const chunks = formatEmoteListChunks([mkEmote('a'), mkEmote('b')]);
        expect(chunks).toHaveLength(1);
        expect(chunks[0]).toContain('`a`:');
        expect(chunks[0]).toContain('`b`:');
    });

    it('splits across chunks when the running total exceeds the cap', () => {
        const emotes = Array.from({ length: 200 }, (_, i) => mkEmote(`alias${i.toString().padStart(3, '0')}`));
        const chunks = formatEmoteListChunks(emotes);
        expect(chunks.length).toBeGreaterThan(1);
        for (const chunk of chunks) {
            expect(chunk.length).toBeLessThanOrEqual(1900);
        }
    });

    it('honors a custom max length when each line fits', () => {
        const emotes = [mkEmote('one'), mkEmote('two'), mkEmote('three')];
        const lineLen = `\`one\`: <https://7tv.app/emotes/one0000000000000>`.length;
        const chunks = formatEmoteListChunks(emotes, lineLen + 1);
        expect(chunks).toHaveLength(emotes.length);
    });

    it('keeps a single oversized line as its own chunk rather than dropping it', () => {
        const huge: [string, Emote] = [
            'h',
            {
                id: 'x'.repeat(100),
                defaultAlias: 'h',
                source: EmoteSource.SEVENTV,
            },
        ];
        const chunks = formatEmoteListChunks([mkEmote('a'), huge], 50);
        const joined = chunks.join('\n');
        expect(joined).toContain(huge[1].id);
        expect(joined).toContain('`a`:');
    });

    it('renders the source-specific URL for each gateway', () => {
        const sevenTv: [string, Emote] = [
            'st',
            { id: '01F', defaultAlias: 'st', source: EmoteSource.SEVENTV },
        ];
        const bttv: [string, Emote] = [
            'bt',
            { id: '5e7', defaultAlias: 'bt', source: EmoteSource.BTTV },
        ];
        const [chunk] = formatEmoteListChunks([sevenTv, bttv]);
        expect(chunk).toContain('https://7tv.app/emotes/01F');
        expect(chunk).toContain('https://betterttv.com/emotes/5e7');
    });
});
