import ytdl, { MoreVideoDetails } from 'ytdl-core';
import { AudioResource, createAudioResource } from '@discordjs/voice';
import * as fs from 'fs';
import * as crypto from 'crypto';
import Track from './track.ts';

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

    public async saveAudio(filePath: string): Promise<string> {
        const randomId = crypto.randomBytes(4).toString('hex');
        const fileName = `${this.title.toLowerCase().replaceAll(/[^a-z0-9]/g, '')}-${randomId}`;
        const audioPath = `${filePath}/${fileName}.mp3`;
        ytdl(this.url, { filter: 'audioonly', dlChunkSize: 0 })
            .pipe(fs.createWriteStream(audioPath));
        return audioPath;
    }

    public async getAudioResource(): Promise<AudioResource<YoutubeTrack>> {
        const stream = ytdl(this.url, { filter: 'audioonly', dlChunkSize: 0 });
        return createAudioResource(stream, { metadata: this });
    }
}
