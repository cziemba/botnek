import { describe, expect, test } from 'vitest';
import { matchSfxAliases } from './search';

describe('matchSfxAliases', () => {
    const aliases = [
        'fart',
        'farts',
        'farting',
        'wow',
        'cowfart',
        'megafart',
        'oof',
        'oofy',
        'goosehonk',
        'honk',
    ];

    test('empty term returns nothing', () => {
        expect(matchSfxAliases(aliases, '')).toEqual([]);
        expect(matchSfxAliases(aliases, '   ')).toEqual([]);
    });

    test('no matches returns empty', () => {
        expect(matchSfxAliases(aliases, 'zzz')).toEqual([]);
    });

    test('substring match', () => {
        const result = matchSfxAliases(aliases, 'fart').map((m) => m.alias);
        expect(result).toContain('fart');
        expect(result).toContain('farts');
        expect(result).toContain('farting');
        expect(result).toContain('cowfart');
        expect(result).toContain('megafart');
        expect(result).not.toContain('wow');
    });

    test('prefix matches rank above mid-string matches', () => {
        const result = matchSfxAliases(aliases, 'fart').map((m) => m.alias);
        // all of fart, farts, farting are prefix matches (idx=0); cowfart/megafart are mid-string
        const firstPrefix = result.indexOf('fart');
        const cowIdx = result.indexOf('cowfart');
        expect(firstPrefix).toBeLessThan(cowIdx);
    });

    test('shorter alias wins tie-break among prefix matches', () => {
        const result = matchSfxAliases(aliases, 'fart').map((m) => m.alias);
        // all prefix matches share idx=0; shorter alias should rank first
        expect(result[0]).toBe('fart');
    });

    test('case-insensitive', () => {
        const result = matchSfxAliases(aliases, 'FART').map((m) => m.alias);
        expect(result).toContain('fart');
    });

    test('respects limit', () => {
        const result = matchSfxAliases(aliases, 'o', 3);
        expect(result).toHaveLength(3);
    });

    test('default limit is 10', () => {
        const many = Array.from({ length: 30 }, (_, i) => `alias${i}`);
        const result = matchSfxAliases(many, 'alias');
        expect(result).toHaveLength(10);
    });

    test('exact alias match returns first', () => {
        const result = matchSfxAliases(aliases, 'honk').map((m) => m.alias);
        expect(result[0]).toBe('honk');
    });
});
