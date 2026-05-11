// Thin shell-out wrappers around ffmpeg / ffprobe. Two design choices worth knowing:
//
//   1. Outputs are content-addressed: the cache key is `md5(inFilename + audioFilters)`,
//      so re-running the same filter chain on the same source short-circuits without
//      spawning ffmpeg or even stat'ing the input. This is what makes /sfx with modifiers
//      cheap on repeat plays. Don't change the digest scheme without invalidating the
//      `${guildDir}/ffmpeg/` cache.
//
//   2. We use `execSync` (blocking) here, not promisified `exec`. The current callers
//      (sfx playback) want the resulting path immediately and the work is small (seconds
//      of audio). The footgun is that paths are interpolated into the shell template
//      string unquoted — currently safe because every input is either an alias matching
//      `/^[a-z0-9]{1,20}$/` or an md5 hex digest, but a switch to `spawn` with arg arrays
//      would close this for good. See docs/staleness.md.

import { execSync } from 'child_process';
import * as crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import log from '../logging/logging';

/**
 * Apply an ffmpeg `-filter:a` chain and cache the output by digest of (input basename + filter
 * string). Returns the cached path on a hit, otherwise spawns ffmpeg and writes a new file.
 *
 * Note the cache key uses `inFilename` (basename without extension), not the full path —
 * intentional, because the base sfx files are content-addressed by alias and won't move.
 */
const ffmpegProcessAudio = (inFile: string, guildDir: string, audioFilters: string): string => {
    if (!fs.existsSync(inFile)) throw new Error(`Bad file path, does not exist ${inFile}`);
    if (!fs.existsSync(guildDir)) fs.mkdirSync(path.resolve(guildDir));

    const ffmpegWorkDir = path.resolve(path.join(guildDir, 'ffmpeg'));
    if (!fs.existsSync(ffmpegWorkDir)) fs.mkdirSync(ffmpegWorkDir);

    const inFilename = path.basename(inFile, path.extname(inFile));
    const filenameDigest = crypto
        .createHash('md5')
        .update(inFilename)
        .update(audioFilters)
        .digest('hex');
    const outFilename = `${filenameDigest}${path.extname(inFile)}`;
    const outPath = path.join(ffmpegWorkDir, outFilename);

    if (fs.existsSync(outPath)) {
        log.info(`Using existing file: ${outPath}`);
        return outPath;
    }

    try {
        log.debug(`Converting ${inFile} -> ${outPath}`);
        execSync(`ffmpeg -i ${inFile} -filter:a "${audioFilters}" -vn ${outPath}`);
        return outPath;
    } catch (e) {
        log.error(e);
        throw e;
    }
};

// `asetrate` retunes the source by raw sample-rate multiplication (so pitch + speed shift
// together — chipmunk for >1, slowed for <1). Followed by `aresample=44100` to renormalize
// the rate so downstream consumers get a sane stream.
export const ffmpegAdjustRate = (inFile: string, guildDir: string, rate: number): string => {
    log.debug(`FFMPEG Adjust rate=${rate}`);
    return ffmpegProcessAudio(inFile, guildDir, `asetrate=44100*${rate}, aresample=44100`);
};

// Two-band manual EQ: boost at 0Hz by `firstDb`, at 450Hz by `secondDb`, flat by 1kHz. The
// linear interpolation between entries gives a smoother low-shelf than a single shelf filter.
export const ffmpegBassBoost = (
    inFile: string,
    guildDir: string,
    firstDb: number,
    secondDb: number,
): string => {
    log.debug(`FFMPEG Bass Boost firstDb=${firstDb} secondDb=${secondDb}`);
    return ffmpegProcessAudio(
        inFile,
        guildDir,
        `firequalizer=gain_entry='entry(0,${firstDb});entry(450,${secondDb});entry(1000,0)', aresample=44100`,
    );
};

/**
 * Get audio file duration in seconds. Uses ffprobe (not ffmpeg) because that's the canonical
 * metadata-only tool and avoids ffmpeg's "did the user mean to convert?" warnings.
 */
export const ffmpegDurationSeconds = (inFile: string): string => {
    try {
        const durationSeconds = execSync(
            `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${inFile}`,
        );
        return durationSeconds.toString();
    } catch (e) {
        log.error(e);
        throw e;
    }
};

// `-ss` and `-to` are placed BEFORE `-i` for an input-side seek, which is fast but
// keyframe-aligned (i.e. may snap up to the next I-frame). For sfx clips the slop is
// imperceptible and the speed gain is large; if frame-accurate trimming is ever needed,
// move these flags after `-i` for an output-side seek.
export const ffmpegTrimAudio = (inFile: string, outFile: string, start?: number, end?: number) => {
    try {
        const args: string[] = [];
        if (start) {
            args.push(`-ss ${start}`); // seek to start
        }
        if (end) {
            args.push(`-to ${end}`); // until end
        }
        execSync(`ffmpeg ${args.join(' ')} -i ${inFile} ${outFile}`);
    } catch (e) {
        log.error(e);
        throw e;
    }
};
