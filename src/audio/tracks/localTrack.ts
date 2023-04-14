import { AudioResource, createAudioResource } from '@discordjs/voice';
import { createReadStream } from 'fs';
import Track from './track.ts';

export default class LocalTrack extends Track {
    public filePath: string;

    constructor(filePath: string, title: string) {
        super(title);
        this.filePath = filePath;
    }

    public async getAudioResource(): Promise<AudioResource<LocalTrack>> {
        return createAudioResource(createReadStream(this.filePath), { metadata: this });
    }
}
