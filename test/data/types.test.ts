import { describe, expect, test } from 'vitest';
import { isSfxModifier, SfxModifier } from '../../src/data/types';

describe('types', () => {
    test('isSfxModifier', () => {
        expect(isSfxModifier('turbo')).toEqual(SfxModifier.TURBO);
        expect(isSfxModifier('burbo')).toEqual(SfxModifier.UNKNOWN);
    });
});
