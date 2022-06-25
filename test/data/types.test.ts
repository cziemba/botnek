import {isSfxModifier, SfxModifier} from "../../src/data/types.js";

describe('types', () => {
    test('isSfxModifier', () => {
        expect(isSfxModifier('turbo')).toEqual(SfxModifier.TURBO);
        expect(isSfxModifier('burbo')).toEqual(SfxModifier.UNKNOWN);
    });
});
