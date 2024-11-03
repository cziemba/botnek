import { parseSfxAlias } from '../../../src/commands/sfx/common.ts';
import { LowWithLodash } from '../../../src/data/db.js';
import { GuildData, SfxModifier } from '../../../src/data/types.ts';

describe('common sfx', () => {
    test('parseSfxAlias', () => {
        jest.mock('../../../src/data/db.js');
        const mockDb = <jest.Mock<LowWithLodash<GuildData>>>LowWithLodash;
        const result = parseSfxAlias(mockDb(), 'fart#turbo');
        expect(result.parsedAlias).toEqual('fart');
        expect(result.modifiers).toHaveLength(1);
        expect(result.modifiers[0]).toBe(SfxModifier.TURBO);
    });
});
