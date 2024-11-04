import { AudioResource, createAudioResource } from '@discordjs/voice';
import ytdl, { MoreVideoDetails } from '@distube/ytdl-core';
import * as crypto from 'crypto';
import * as fs from 'fs';
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
        const basicInfo = await ytdl.getBasicInfo(url);
        return new YoutubeTrack(url, basicInfo.videoDetails);
    }

    public static checkUrl(url: string): boolean {
        return ytdl.validateURL(url);
    }

    /**
     * Save this YouTube track according to the video title and parameters specified.
     * Looks for base file [already downloaded] for duration trimming.
     * @param audioStoragePath Where to put the resulting audio file.
     * @param startAtSeconds Start time (seconds)
     * @param endAtSeconds End time (seconds)
     */
    public async saveAudio(
        audioStoragePath: string,
        startAtSeconds?: number,
        endAtSeconds?: number,
    ): Promise<string> {
        const initialTitle = `${this.title.toLowerCase().replaceAll(/[^a-z0-9]/g, '')}`;
        const baseAudioFilePath = `${audioStoragePath}/${initialTitle}.mp3`;

        // If not present: Save original file at deterministic location
        let finalAudioPath = baseAudioFilePath;
        if (fs.existsSync(baseAudioFilePath)) {
            log.info(`File already exists for ${initialTitle}`);
        } else {
            ytdl(this.url, { filter: 'audioonly', dlChunkSize: 0 }).pipe(
                fs.createWriteStream(baseAudioFilePath),
            );
        }

        // If duration args present: ffmpeg trim and save at deterministic location
        if (startAtSeconds || endAtSeconds) {
            const durationArgs = {
                start: startAtSeconds,
                end: endAtSeconds,
            };
            const titleDigest = crypto
                .createHash('md5')
                .update(initialTitle)
                .update(JSON.stringify(durationArgs))
                .digest('hex');
            finalAudioPath = `${audioStoragePath}/${titleDigest}.mp3`;

            ffmpegTrimAudio(baseAudioFilePath, finalAudioPath, startAtSeconds, endAtSeconds);
        }

        // Return final path of sfx
        return finalAudioPath;
    }

    public async getAudioResource(): Promise<AudioResource<YoutubeTrack>> {
        const stream = ytdl(this.url, { filter: 'audioonly', dlChunkSize: 0 });
        return createAudioResource(stream, { metadata: this });
    }
}
