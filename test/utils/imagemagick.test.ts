import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, test } from 'vitest';
import { convertToGif, extractFrameDelay, getExtension } from '../../src/utils/imagemagick';

const WEBP_4DELAY = path.resolve(__dirname, '../tst-data/4delay.webp');
const WEBP_PNG = path.resolve(__dirname, '../tst-data/static.webp');
const TMPFILE = (ext: string) => path.resolve(os.tmpdir(), `${crypto.randomUUID()}.${ext}`);

describe('imagemagick', () => {
    describe('extractFrameDelay', () => {
        test('returns delay', async () => {
            expect(await extractFrameDelay(WEBP_4DELAY)).toBe(4);
        });

        test('throws on static image', async () => {
            await expect(async () => extractFrameDelay(WEBP_PNG)).rejects.toThrow();
        });
    });

    describe('getExtensions', () => {
        test('returns correct for misnamed webp', async () => {
            expect(await getExtension(WEBP_PNG)).toBe('png');
        });

        test('returns correct for webp', async () => {
            expect(await getExtension(WEBP_4DELAY)).toBe('webp');
        });
    });

    describe('convertToGif', () => {
        test('cleans up old file', async () => {
            const { tempGif, tempWebp } = { tempGif: TMPFILE('gif'), tempWebp: TMPFILE('webp') };
            fs.copyFileSync(WEBP_4DELAY, tempWebp);
            await convertToGif(tempWebp, tempGif, 4);
            expect(fs.existsSync(tempWebp)).toBeFalsy();
            expect(fs.existsSync(tempGif)).toBeTruthy();
            expect(await extractFrameDelay(tempGif)).toBe(4);
        }, 30_000);

        test('works on static image', async () => {
            const { tempGif, tempWebp } = { tempGif: TMPFILE('gif'), tempWebp: TMPFILE('webp') };
            fs.copyFileSync(WEBP_PNG, tempWebp);
            await convertToGif(tempWebp, tempGif, 4);
            expect(fs.existsSync(tempWebp)).toBeFalsy();
            expect(fs.existsSync(tempGif)).toBeTruthy();
        }, 30_000);
    });
});
