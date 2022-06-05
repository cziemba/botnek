import { parseSfxAlias } from './sfx.js';
import { SfxModifier } from '../data/types.js';

describe('sfx', () => {
    test('parseSfxAlias', () => {
        const result = parseSfxAlias('fart#turbo');
        expect(result.parsedAlias).toEqual('fart');
        expect(result.modifiers).toHaveLength(1);
        expect(result.modifiers[0]).toBe(SfxModifier.TURBO);
    });
});
