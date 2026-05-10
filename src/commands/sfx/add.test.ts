import { describe, expect, test } from 'vitest';
import { MAX_SFX_LENGTH_SECONDS, validateSfxRange } from './add';

describe('validateSfxRange', () => {
    const cases: {
        name: string;
        input: Parameters<typeof validateSfxRange>[0];
        expectOk: boolean;
        expectDuration?: number;
    }[] = [
        {
            name: 'no trim, video shorter than max',
            input: { videoLengthSeconds: 10 },
            expectOk: true,
            expectDuration: 10,
        },
        {
            name: 'no trim, video longer than max',
            input: { videoLengthSeconds: 60 },
            expectOk: false,
        },
        {
            name: 'start only, remaining within max',
            input: { videoLengthSeconds: 60, startFromSeconds: 40 },
            expectOk: true,
            expectDuration: 20,
        },
        {
            name: 'start only, remaining exceeds max',
            input: { videoLengthSeconds: 120, startFromSeconds: 10 },
            expectOk: false,
        },
        {
            name: 'end only within max',
            input: { videoLengthSeconds: 120, endAtSeconds: 25 },
            expectOk: true,
            expectDuration: 25,
        },
        {
            name: 'end only exceeds max',
            input: { videoLengthSeconds: 120, endAtSeconds: 90 },
            expectOk: false,
        },
        {
            name: 'start + end inside max',
            input: { videoLengthSeconds: 120, startFromSeconds: 10, endAtSeconds: 30 },
            expectOk: true,
            expectDuration: 20,
        },
        {
            name: 'start + end exactly at max boundary',
            input: { videoLengthSeconds: 120, startFromSeconds: 10, endAtSeconds: 40 },
            expectOk: true,
            expectDuration: MAX_SFX_LENGTH_SECONDS,
        },
        {
            name: 'start + end one second over max',
            input: { videoLengthSeconds: 120, startFromSeconds: 10, endAtSeconds: 41 },
            expectOk: false,
        },
        {
            name: 'end past video length is clamped',
            input: { videoLengthSeconds: 20, startFromSeconds: 5, endAtSeconds: 9999 },
            expectOk: true,
            expectDuration: 15,
        },
        {
            name: 'historical bug: long video, big start, no end — must reject',
            input: { videoLengthSeconds: 600, startFromSeconds: 100 },
            expectOk: false,
        },
        {
            name: 'zero-length window rejected',
            input: { videoLengthSeconds: 60, startFromSeconds: 10, endAtSeconds: 10 },
            expectOk: false,
        },
        {
            name: 'inverted window rejected (negative duration)',
            input: { videoLengthSeconds: 60, startFromSeconds: 30, endAtSeconds: 10 },
            expectOk: false,
        },
        {
            name: 'custom max accepted',
            input: { videoLengthSeconds: 200, endAtSeconds: 100, maxSeconds: 120 },
            expectOk: true,
            expectDuration: 100,
        },
    ];

    test.each(cases)('$name', ({ input, expectOk, expectDuration }) => {
        const result = validateSfxRange(input);
        expect(result.ok).toBe(expectOk);
        if (expectDuration !== undefined) {
            expect(result.durationSeconds).toBe(expectDuration);
        }
        if (!expectOk) {
            expect(result.reason).toBeTruthy();
        }
    });
});
