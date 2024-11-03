import { describe, expect, test, vi } from 'vitest';
import { parseSfxAlias } from '../../../src/commands/sfx/common';
import { SfxModifier } from '../../../src/data/types';

describe('common sfx', () => {
    test('parseSfxAlias', () => {
        const mockDb = vi.fn();
        const result = parseSfxAlias(mockDb(), 'fart#turbo');
        expect(result.parsedAlias).toEqual('fart');
        expect(result.modifiers).toHaveLength(1);
        expect(result.modifiers[0]).toBe(SfxModifier.TURBO);
    });
});
