import { parseSfxAlias } from '../../../src/commands/sfx/common.js';
import { SfxModifier } from '../../../src/data/types.js';

describe('common sfx', () => {
    test('parseSfxAlias', () => {
        const result = parseSfxAlias('fart#turbo');
        expect(result.parsedAlias).toEqual('fart');
        expect(result.modifiers).toHaveLength(1);
        expect(result.modifiers[0]).toBe(SfxModifier.TURBO);
    });
});
