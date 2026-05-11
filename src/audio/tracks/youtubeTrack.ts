// Track backed by a YouTube video.
//
// Uses @distube/ytdl-core because the upstream `ytdl-core` package is in a perpetual
// game of cat-and-mouse with YouTube's signature/format changes. Even @distube falls
// behind periodically — the integration test currently fails with "no playable formats"
// on some videos. Treat YoutubeTrack.checkUrl/fromUrl as the swap seam: if @distube goes
// stale, replace the imports here without touching the rest of the audio pipeline.
//
// Two distinct code paths:
//   - getAudioResource() — live streaming for /play. Opens an HTTP stream to YouTube
//     and feeds it directly to the AudioPlayer. No on-disk caching; replaying the same
//     URL re-downloads.
//   - saveAudio() — download-to-disk for /sfx add. Writes a deterministic mp3 path so
//     repeat adds of the same alias are idempotent, then optionally trims via ffmpeg
//     into a second deterministic location keyed by (title + trim args).

import { AudioResource, createAudioResource } from '@discordjs/voice';
import ytdl, { MoreVideoDetails } from '@distube/ytdl-core';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import log from '../../logging/logging';
import { ffmpegTrimAudio } from '../../utils/ffmpeg';
import Track from './track';

export default class YoutubeTrack extends Track {
    public url: string;

    public videoDetails: MoreVideoDetails;

    constructor(url: string, videoDetails: MoreVideoDetails) {
        super(videoDetails.title);
        this.url = url;
        this.videoDetails = videoDetails;
    }

    public static async fromUrl(url: string): Promise<YoutubeTrack> {
        // getBasicInfo is one HTTP call, much lighter than the full getInfo (which
        // resolves every available format). We only need title + lengthSeconds for the
        // /sfx add range validation; the actual stream URL gets resolved later inside
        // the ytdl() call in getAudioResource/saveAudio.
        const basicInfo = await ytdl.getBasicInfo(url);
        return new YoutubeTrack(url, basicInfo.videoDetails);
    }

    public static checkUrl(url: string): boolean {
        return ytdl.validateURL(url);
    }

    /**
     * Download the YouTube audio to disk, optionally trimmed.
     *
     * Two-stage cache:
     *   1. Untrimmed source at `<sluggified-title>.mp3` — keyed only on title, so two
     *      adds of different segments of the same video share the source download.
     *   2. Trimmed output (only if start/end given) at `<md5(title + args)>.mp3` — the
     *      digest covers both args so different trim ranges don't collide.
     *
     * Both keys are deterministic, so re-running /sfx add with identical args is a no-op
     * (skips the YouTube fetch and the ffmpeg shell-out). The 0-byte check guards against
     * a previous attempt that crashed mid-pipeline and left an empty placeholder.
     *
     * Returns the path that should be persisted in the sfx db.
     */
    public async saveAudio(
        audioStoragePath: string,
        startAtSeconds?: number,
        endAtSeconds?: number,
    ): Promise<string> {
        // Strip non-alphanumerics so filenames stay shell-safe — the ffmpeg shell-outs
        // currently don't quote paths (see staleness.md "command-injection shape").
        const initialTitle = `${this.title.toLowerCase().replaceAll(/[^a-z0-9]/g, '')}`;
        const baseAudioFilePath = `${audioStoragePath}/${initialTitle}.mp3`;

        let finalAudioPath = baseAudioFilePath;
        if (fs.existsSync(baseAudioFilePath) && fs.statSync(baseAudioFilePath).size > 0) {
            // Cache hit on the source download — skip the YouTube fetch entirely.
            log.info(`File ${baseAudioFilePath} already exists for ${initialTitle}`);
        } else {
            // pipeline() handles backpressure + cleanup if either side errors. A plain
            // .pipe() would leak the write stream on a YouTube fetch error.
            await pipeline(
                ytdl(this.url, { filter: 'audioonly' }),
                fs.createWriteStream(baseAudioFilePath),
            );
        }

        // FOOTGUN: explicit `!== undefined` checks because startAtSeconds === 0 is a
        // legitimate value ("trim from the beginning to a specific end"). A truthy check
        // would silently drop the trim args and play the full video.
        if (startAtSeconds !== undefined || endAtSeconds !== undefined) {
            const durationArgs = {
                start: startAtSeconds,
                end: endAtSeconds,
            };
            // md5 here is a cache key, not a security primitive. Including JSON.stringify
            // of the args means {start:1} and {end:1} produce different digests — needed
            // because they're semantically different trims.
            const titleDigest = crypto
                .createHash('md5')
                .update(initialTitle)
                .update(JSON.stringify(durationArgs))
                .digest('hex');
            finalAudioPath = `${audioStoragePath}/${titleDigest}.mp3`;

            ffmpegTrimAudio(baseAudioFilePath, finalAudioPath, startAtSeconds, endAtSeconds);
        }

        return finalAudioPath;
    }

    public async getAudioResource(): Promise<AudioResource<YoutubeTrack>> {
        // dlChunkSize: 0 disables ytdl-core's chunked download in favour of one
        // continuous stream. Chunking adds ~1-2s of latency at chunk boundaries which
        // shows up as audible gaps mid-track during voice playback.
        const stream = ytdl(this.url, { filter: 'audioonly', dlChunkSize: 0 });
        return createAudioResource(stream, { metadata: this });
    }
}
