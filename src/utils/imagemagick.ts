import { promisify } from 'util';
import * as child_process from 'child_process';
import * as mime from 'mime-types';
import fs from 'fs';
import log from '../logging/logging.js';

const exec = promisify(child_process.exec);
const DEFAULT_RESIZE = '112x112^';

/**
 * Extract frame delay (assume consistent timing) from animated image in hundredths of seconds.
 * @param inFile
 */
export const extractFrameDelay = async (inFile: string): Promise<number> => {
    const { stdout, stderr } = await exec(['identify', '-verbose', inFile, '|', 'grep', '-m1', 'Delay'].join(' '));
    if (stderr) log.error(stderr);
    const matches = stdout.match(/Delay: (?<num>\d+)x(?<magnitude>\d+)/);
    if (!matches || !matches.groups?.num || !matches.groups?.magnitude) throw new Error(`Cannot find delay in ${inFile}`);
    const delayMs = Number(matches.groups.num) * Number(matches.groups.magnitude);
    log.info(`Detected frame delay of ${delayMs / 100} in ${inFile}`);
    return delayMs / 100;
};

/**
 * Extract the file extension from its mime type (image/gif -> .gif, image/webp -> .webp)
 * @param inFile
 */
export const getExtension = async (inFile: string): Promise<string> => {
    const outputs = (await exec(`file --mime-type ${inFile}`)).stdout.split(' ');
    return mime.extension(outputs[outputs.length - 1]);
};

/**
 * Convert the file to a gif with the desired frame timing. Cleanup old file afterwards.
 * @param inFile
 * @param outFile
 * @param frameTime in hundredths of seconds
 * @param resize dimensions to resize to
 */
export const convertToGif = async (inFile: string, outFile: string, frameTime: number, resize?: string): Promise<void> => {
    const execArgs = ['convert',
        inFile,
        '-coalesce',
        '-resize', resize || DEFAULT_RESIZE,
        '-delay', frameTime,
        '-dispose', 'previous',
        outFile];
    log.info(execArgs.join(' '));
    const { stderr } = await exec(execArgs.join(' '));
    if (stderr) log.error(stderr);
    if (fs.existsSync(inFile)) fs.rmSync(inFile); // Cleanup inFile
};
