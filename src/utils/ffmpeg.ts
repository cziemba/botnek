import { execSync } from 'child_process';
import * as crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import log from '../logging/logging';

/**
 * Process the input audio file using whatever filters specified (refer to ffmpeg docs).
 * Writes the file into the guild's 'ffmpeg' storage dir, using deterministic digests for file names.
 *
 * Calling this function twice with the same parameters will only process the input once, allowing previously processed files to be re-used.
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

export const ffmpegAdjustRate = (inFile: string, guildDir: string, rate: number): string => {
    log.debug(`FFMPEG Adjust rate=${rate}`);
    return ffmpegProcessAudio(inFile, guildDir, `asetrate=44100*${rate}, aresample=44100`);
};

/**
 * Get audio file duration in seconds
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
