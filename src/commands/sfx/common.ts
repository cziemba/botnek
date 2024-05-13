import {
    GuildData, SfxAlias, SfxModifier, isSfxModifier, isValidSfxAlias,
} from '../../data/types.ts';
import { LowWithLodash } from '../../data/db.ts';
import log from '../../logging/logging.ts';
import LocalTrack from '../../audio/tracks/localTrack.ts';
import { ffmpegAdjustRate } from '../../utils/ffmpeg.ts';

export const RANDOM = 'random';

/**
 * Generate formatted string for a given sfx alias + modifiers
 * @param sfxAlias
 * @param sfxModifiers
 */
export function sfxAliasToString(sfxAlias: SfxAlias, sfxModifiers: SfxModifier[]): string {
    const modifiersString = sfxModifiers.length === 0 ? ''
        : `#${sfxModifiers.join('#')}`;
    return `\`${sfxAlias}${modifiersString}\``;
}

export function sfxExists(db: LowWithLodash<GuildData>, alias: string): boolean {
    const soundsDb = db.chain.get('sfx').get('sounds');
    return soundsDb.has(alias).value();
}

/**
 * Choose a random sfx alias
 */
export function randomSfxAlias(db: LowWithLodash<GuildData>): string {
    const sfxKeys = db.chain.get('sfx').get('sounds').keys();
    return sfxKeys.get(Math.floor(Math.random() * (sfxKeys.size().value() - 1))).value();
}

/**
 * Normalize sfx alias input, subbing any reserved keywords like 'random'
 */
export function normalizeAliasInput(db: LowWithLodash<GuildData>, alias: string): string {
    let normalizedAlias = alias.toLowerCase();

    if (RANDOM === normalizedAlias) {
        normalizedAlias = randomSfxAlias(db);
    }

    return normalizedAlias;
}

/**
 * Parse sfx alias input with modifiers e.g. 'sound#TURBO#TURBO' should parse properly into two Turbo modifiers for 'sound'.
 */
export function parseSfxAlias(db: LowWithLodash<GuildData>, alias: string): { parsedAlias: SfxAlias, modifiers: SfxModifier[] } {
    const aliasParts = alias.split('#');
    log.debug(`Recieved aliasParts=[${aliasParts.join(',')}]`);
    if (aliasParts.length < 1) {
        throw new Error(`Could not parse sfx alias: ${alias}!`);
    }

    const normalizedAlias = normalizeAliasInput(db, aliasParts[0]);
    if (!isValidSfxAlias(normalizedAlias)) {
        throw new Error(`Invalid sfx alias [alias=${alias}, normalized-to=${normalizedAlias}]`);
    }

    let mods: SfxModifier[] = [];
    if (aliasParts.length === 1) {
        mods = [];
    } else {
        mods = aliasParts.slice(1)
            .map((m) => isSfxModifier(m))
            .filter((m) => m !== SfxModifier.UNKNOWN)
            .slice(0, 2);
    }

    return { parsedAlias: normalizedAlias, modifiers: mods };
}

export function handleModifiers(sfxFile: string, sfxAlias: string, modifiers: SfxModifier[], guildDir: string): LocalTrack {
    if (modifiers.length === 0) {
        return new LocalTrack(sfxFile, sfxAlias);
    }
    let finalPath = sfxFile;
    for (let i = 0; i < modifiers.length; i += 1) {
        switch (String(modifiers[i])) {
            case SfxModifier.TURBO: {
                finalPath = ffmpegAdjustRate(finalPath, guildDir, 4 / 3);
                break;
            }
            case SfxModifier.TURBO2: {
                finalPath = ffmpegAdjustRate(finalPath, guildDir, 2);
                break;
            }
            case SfxModifier.SLOW: {
                finalPath = ffmpegAdjustRate(finalPath, guildDir, 3 / 4);
                break;
            }
            case SfxModifier.SLOW2: {
                finalPath = ffmpegAdjustRate(finalPath, guildDir, 1 / 2);
                break;
            }
            default: {
                break;
            }
        }
    }
    return new LocalTrack(finalPath, `${sfxAlias} [${modifiers.join(',')}]`);
}

/**
 * Load sfx path based on alias, checking if it is valid.
 */
export function loadSfxPath(db: LowWithLodash<GuildData>, alias: SfxAlias): string | undefined {
    const sfxAliasToPlay = alias;

    if (!sfxExists(db, sfxAliasToPlay)) {
        log.info(`Unknown sfx ${sfxAliasToPlay}`);
        return undefined;
    }

    return db.chain.get('sfx').get('sounds').get(sfxAliasToPlay).value();
}
