// Shell-out wrappers around ImageMagick (`convert`, `identify`) and `file`. Unlike
// src/utils/ffmpeg.ts, these use promisified `exec` (async) — the emote ingestion path
// already awaits a network fetch, so blocking the event loop here would force serialized
// requests. ffmpeg in sfx playback can stay sync because that path is already fast and
// per-guild-serialized at the queue level.
//
// Same shell-injection footgun as ffmpeg.ts: paths are interpolated unquoted into template
// strings. Currently safe because callers pass paths derived from emote ids (alphanumeric)
// or md5 digests, but a `spawn` with arg arrays would close it. See docs/staleness.md.

import * as child_process from 'child_process';
import fs from 'fs';
import * as mime from 'mime-types';
import { promisify } from 'util';
import log from '../logging/logging';

const exec = promisify(child_process.exec);

// Discord server-emoji target dimensions: 112x112, `^` = "fill at least", preserving aspect.
// Smaller than the upload size cap so the resulting gif tends to fit; if it doesn't, the
// caller (commands/serverEmoji.ts) retries once with `64x64^`.
const DEFAULT_RESIZE = '112x112^';

/**
 * Read the per-frame delay out of an animated image's metadata. ImageMagick reports delay as
 * `Delay: <num>x<magnitude>` (e.g. `2x100` = 2/100 of a second per frame); we collapse that
 * to a single number in hundredths of a second to match the units `convert -delay` expects on
 * the way back out, so callers can round-trip a gif's timing without unit conversion.
 */
export const extractFrameDelay = async (inFile: string): Promise<number> => {
    // Pipe through grep to avoid loading `identify -verbose`'s entire (large) output into
    // Node only to throw most of it away.
    const { stdout, stderr } = await exec(
        ['identify', '-verbose', inFile, '|', 'grep', '-m1', 'Delay'].join(' '),
    );
    if (stderr) log.error(stderr);
    const matches = stdout.match(/Delay: (?<num>\d+)x(?<magnitude>\d+)/);
    if (!matches || !matches.groups?.num || !matches.groups?.magnitude)
        throw new Error(`Cannot find delay in ${inFile}`);
    const delayMs = Number(matches.groups.num) * Number(matches.groups.magnitude);
    log.info(`Detected frame delay of ${delayMs / 100} in ${inFile}`);
    return delayMs / 100;
};

/**
 * Sniff the file's actual mime type and return the canonical extension. We don't trust the
 * downloaded file's extension because emote gateways serve `.webp` behind URLs that look
 * like `.gif` and vice versa; ImageMagick / Discord emoji upload need the real type.
 */
export const getExtension = async (inFile: string): Promise<string> => {
    const outputs = (await exec(`file --mime-type ${inFile}`)).stdout.split(' ');
    return mime.extension(outputs[outputs.length - 1]);
};

/**
 * Re-encode an animated image to a gif of the given dimensions and frame timing. Two flags
 * worth flagging:
 *  - `-coalesce`: flattens the source's frame-disposal layers into full standalone frames.
 *    Without this, source gifs that use partial-frame updates render with smearing trails.
 *  - `-dispose previous`: emit the result with the simple "restore to prior frame" disposal,
 *    which Discord's gif renderer handles consistently.
 *
 * Deletes `inFile` on success — caller passes a temp download that's no longer needed.
 */
export const convertToGif = async (
    inFile: string,
    outFile: string,
    frameTime: number,
    resize?: string,
): Promise<void> => {
    const execArgs = [
        'convert',
        inFile,
        '-coalesce',
        '-resize',
        resize || DEFAULT_RESIZE,
        '-delay',
        frameTime,
        '-dispose',
        'previous',
        outFile,
    ];
    log.info(execArgs.join(' '));
    const { stderr } = await exec(execArgs.join(' '));
    if (stderr) log.error(stderr);
    if (fs.existsSync(inFile)) fs.rmSync(inFile); // Cleanup inFile
};
