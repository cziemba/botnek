import { SfxModifier } from '../../data/types.js';
import { parseSfxAlias } from './common.js';

describe('common sfx', () => {
    test('parseSfxAlias', () => {
        const result = parseSfxAlias('fart#turbo');
        expect(result.parsedAlias).toEqual('fart');
        expect(result.modifiers).toHaveLength(1);
        expect(result.modifiers[0]).toBe(SfxModifier.TURBO);
    });
});
