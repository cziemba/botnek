// Shared sfx machinery: alias parsing, modifier compilation into ffmpeg invocations,
// and the alias -> path resolver. Keep the modifier switch in handleModifiers in sync
// with the SfxModifier enum and the help text in sfx/help.ts — the three lists are
// hand-maintained mirrors.

import LocalTrack from '../../audio/tracks/localTrack';
import { LowWithLodash } from '../../data/db';
import { resolveSfxPath } from '../../data/sfxPaths';
import { GuildData, isSfxModifier, isValidSfxAlias, SfxAlias, SfxModifier } from '../../data/types';
import log from '../../logging/logging';
import { ffmpegAdjustRate, ffmpegBassBoost } from '../../utils/ffmpeg';

// Reserved keyword that resolves at parse-time to a randomly-picked alias from the
// guild's sfx library. A user adding an sfx literally named "random" would clobber the
// keyword, so it's blocked in /sfx add (RESERVED_ALIAS).
export const RANDOM = 'random';

/**
 * Generate formatted string for a given sfx alias + modifiers
 * @param sfxAlias
 * @param sfxModifiers
 */
export function sfxAliasToString(sfxAlias: SfxAlias, sfxModifiers: SfxModifier[]): string {
    const modifiersString = sfxModifiers.length === 0 ? '' : `#${sfxModifiers.join('#')}`;
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
 * Parse 'alias#MOD1#MOD2' into the alias and a list of recognised modifiers.
 * Unknown modifiers are silently dropped (filtered out as SfxModifier.UNKNOWN) rather
 * than throwing, so users with typos still get the base sfx instead of an error wall.
 * Capped at 2 modifiers to bound the ffmpeg pipeline depth.
 */
export function parseSfxAlias(
    db: LowWithLodash<GuildData>,
    alias: string,
): { parsedAlias: SfxAlias; modifiers: SfxModifier[] } {
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
        mods = aliasParts
            .slice(1)
            .map((m) => isSfxModifier(m))
            .filter((m) => m !== SfxModifier.UNKNOWN)
            .slice(0, 2);
    }

    return { parsedAlias: normalizedAlias, modifiers: mods };
}

/**
 * Compile a sfx + ordered modifier list into a LocalTrack. Each modifier shells out to
 * ffmpeg in sequence; outputs are cached deterministically by ffmpegProcessAudio so
 * repeat invocations of the same (alias, mod) tuple skip the shell-out entirely.
 *
 * Order matters: modifiers compose, not commute. SLOW#BASS sounds different from
 * BASS#SLOW because the rate change shifts the frequencies the bass filter then
 * targets. We honour insertion order to match what the user typed.
 */
export function handleModifiers(
    sfxFile: string,
    sfxAlias: string,
    modifiers: SfxModifier[],
    guildDir: string,
): LocalTrack {
    if (modifiers.length === 0) {
        return new LocalTrack(sfxFile, sfxAlias);
    }
    let finalPath = sfxFile;
    for (let i = 0; i < modifiers.length; i += 1) {
        // Rate values are picked for "noticeable but still recognisable":
        // 4/3 = +33% speed, 2 = double speed (chipmunk territory),
        // 3/4 = -25% speed, 1/2 = half speed (Earth-rumble territory).
        // Bass dB pairs target the (0Hz, 450Hz) gain entries — see ffmpegBassBoost.
        // The 1000Hz entry is fixed at 0dB to leave the high-mid range alone.
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
            case SfxModifier.BASS: {
                finalPath = ffmpegBassBoost(finalPath, guildDir, 50, 20);
                break;
            }
            case SfxModifier.BASS2: {
                finalPath = ffmpegBassBoost(finalPath, guildDir, 80, 40);
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
 * Load the absolute filesystem path for an sfx alias, or undefined if unknown. Resolves
 * the stored value (canonically relative-to-guildDir, with legacy absolute paths still
 * tolerated by resolveSfxPath) against the supplied guildDir so callers always get a
 * path they can hand straight to ffmpeg / createAudioResource.
 */
export function loadSfxPath(
    db: LowWithLodash<GuildData>,
    alias: SfxAlias,
    guildDirPath: string,
): string | undefined {
    if (!sfxExists(db, alias)) {
        log.info(`Unknown sfx ${alias}`);
        return undefined;
    }

    const stored = db.chain.get('sfx').get('sounds').get(alias).value();
    return resolveSfxPath(guildDirPath, stored);
}
