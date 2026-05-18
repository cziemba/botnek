import path from 'path';
import { describe, expect, test } from 'vitest';
import { guildDir, migrateSfxSounds, resolveSfxPath, toStoredSfxPath } from './sfxPaths';

const GUILD = '300748021300330497';
const ROOT = '/home/cziemba/.botnek2/data';
const DIR = path.resolve(path.join(ROOT, GUILD));

describe('guildDir', () => {
    test('joins dataRoot + guildId', () => {
        expect(guildDir(ROOT, GUILD)).toBe(DIR);
    });
});

describe('resolveSfxPath', () => {
    test('relative input resolves against guildDir', () => {
        expect(resolveSfxPath(DIR, 'sounds/foo.mp3')).toBe(path.join(DIR, 'sounds/foo.mp3'));
    });

    test('absolute input is returned as-is (legacy tolerance)', () => {
        const legacy = '/home/pi/.local/share/botnek2/300748021300330497/sounds/foo.mp3';
        expect(resolveSfxPath(DIR, legacy)).toBe(legacy);
    });
});

describe('toStoredSfxPath', () => {
    test('strips guildDir prefix from a path under it', () => {
        const abs = path.join(DIR, 'sounds', 'foo.mp3');
        expect(toStoredSfxPath(DIR, abs)).toBe(path.join('sounds', 'foo.mp3'));
    });

    test('throws when target is outside guildDir', () => {
        expect(() => toStoredSfxPath(DIR, '/etc/passwd')).toThrow(/outside guildDir/);
    });
});

describe('migrateSfxSounds', () => {
    test('empty input is a no-op', () => {
        const res = migrateSfxSounds(GUILD, {});
        expect(res).toEqual({ sounds: {}, migrated: 0, skipped: [] });
    });

    test('already-relative entries pass through unchanged', () => {
        const res = migrateSfxSounds(GUILD, {
            fart: 'sounds/fart.mp3',
            airhorn: 'sounds/airhorn.mp3',
        });
        expect(res.sounds).toEqual({
            fart: 'sounds/fart.mp3',
            airhorn: 'sounds/airhorn.mp3',
        });
        expect(res.migrated).toBe(0);
        expect(res.skipped).toEqual([]);
    });

    test('absolute paths containing the guildId marker get rewritten', () => {
        const res = migrateSfxSounds(GUILD, {
            fart: `/home/pi/.local/share/botnek2/${GUILD}/sounds/fart.mp3`,
            airhorn: `/some/other/root/${GUILD}/sounds/airhorn.mp3`,
        });
        expect(res.sounds).toEqual({
            fart: 'sounds/fart.mp3',
            airhorn: 'sounds/airhorn.mp3',
        });
        expect(res.migrated).toBe(2);
        expect(res.skipped).toEqual([]);
    });

    test('absolute paths without the guildId marker are skipped, not lost', () => {
        const orphan = '/somewhere/odd/fart.mp3';
        const res = migrateSfxSounds(GUILD, { fart: orphan });
        expect(res.sounds.fart).toBe(orphan);
        expect(res.migrated).toBe(0);
        expect(res.skipped).toEqual([{ alias: 'fart', stored: orphan }]);
    });

    test('mixed inputs only rewrite the absolute-with-marker entries', () => {
        const res = migrateSfxSounds(GUILD, {
            already: 'sounds/already.mp3',
            stale: `/home/pi/.local/share/botnek2/${GUILD}/sounds/stale.mp3`,
            orphan: '/random/place/orphan.mp3',
        });
        expect(res.sounds).toEqual({
            already: 'sounds/already.mp3',
            stale: 'sounds/stale.mp3',
            orphan: '/random/place/orphan.mp3',
        });
        expect(res.migrated).toBe(1);
        expect(res.skipped).toEqual([{ alias: 'orphan', stored: '/random/place/orphan.mp3' }]);
    });
});
