import {isSfxModifier, SfxModifier} from '../../src/data/types.ts';

describe('types', () => {
    test('isSfxModifier', () => {
        expect(isSfxModifier('turbo')).toEqual(SfxModifier.TURBO);
        expect(isSfxModifier('burbo')).toEqual(SfxModifier.UNKNOWN);
    });
});
