import { describe, expect, it } from 'vitest';
import EmoteConfigManager from '../../data/emoteConfigManager';
import { Emote, EmoteAlias, EmoteSource } from '../../data/types/emote';
import { findEmoteAliases, resolveEmoteAliases } from './emote';

function fakeManager(known: Record<string, Emote>): EmoteConfigManager {
    return {
        aliasExists: (alias: string) => Object.prototype.hasOwnProperty.call(known, alias),
        get: (alias: string) => known[alias],
    } as unknown as EmoteConfigManager;
}

const mkEmote = (id: string): Emote => ({
    id,
    defaultAlias: id,
    source: EmoteSource.SEVENTV,
});

describe('findEmoteAliases', () => {
    const manager = fakeManager({ catJam: mkEmote('a'), pog: mkEmote('b') });

    it('returns aliases for whitespace-separated tokens that exist in the manager', () => {
        expect(findEmoteAliases('catJam pog', manager)).toEqual(['catJam', 'pog']);
    });

    it('preserves duplicate aliases in order so a user can spam an emote', () => {
        expect(findEmoteAliases('pog pog catJam pog', manager)).toEqual([
            'pog',
            'pog',
            'catJam',
            'pog',
        ]);
    });

    it('skips tokens that fail the alias regex (punctuation, length, etc.)', () => {
        expect(findEmoteAliases('catJam, pog! some-thing-way-too-long-to-match', manager)).toEqual(
            [],
        );
    });

    it('skips tokens that match the regex but are unknown to the manager', () => {
        expect(findEmoteAliases('catJam unknown pog', manager)).toEqual(['catJam', 'pog']);
    });

    it('returns empty for an empty / whitespace-only message', () => {
        expect(findEmoteAliases('', manager)).toEqual([]);
        expect(findEmoteAliases('   \t\n', manager)).toEqual([]);
    });

    it('handles tabs and multiple spaces between aliases', () => {
        expect(findEmoteAliases('catJam\t\tpog\n\npog', manager)).toEqual(['catJam', 'pog', 'pog']);
    });
});

describe('resolveEmoteAliases', () => {
    it('zips aliases with their emote records via the manager', () => {
        const manager = fakeManager({ a: mkEmote('id-a'), b: mkEmote('id-b') });
        const resolved = resolveEmoteAliases(['a', 'b'] as EmoteAlias[], manager);
        expect(resolved).toEqual([
            { alias: 'a', emote: mkEmote('id-a') },
            { alias: 'b', emote: mkEmote('id-b') },
        ]);
    });
});
