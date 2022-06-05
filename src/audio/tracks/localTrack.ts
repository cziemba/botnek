import { AudioResource, createAudioResource } from '@discordjs/voice';
import Track from './track.js';

export default class LocalTrack extends Track {
    public filePath: string;

    constructor(filePath: string, title: string) {
        super(title);
        this.filePath = filePath;
    }

    public async getAudioResource(): Promise<AudioResource<LocalTrack>> {
        return createAudioResource(this.filePath, { metadata: this });
    }
}
