import { parseSfxAlias } from '../../../src/commands/sfx/common.ts';
import { SfxModifier } from '../../../src/data/types.ts';

describe('common sfx', () => {
    test('parseSfxAlias', () => {
        const result = parseSfxAlias('fart#turbo');
        expect(result.parsedAlias).toEqual('fart');
        expect(result.modifiers).toHaveLength(1);
        expect(result.modifiers[0]).toBe(SfxModifier.TURBO);
    });
});
