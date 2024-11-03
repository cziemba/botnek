import { AudioResource, createAudioResource } from '@discordjs/voice';
import log from '../../logging/logging.js';
import Track from './track';

export default class LocalTrack extends Track {
    public filePath: string;

    constructor(filePath: string, title: string) {
        super(title);
        this.filePath = filePath;
    }

    public async getAudioResource(): Promise<AudioResource<LocalTrack>> {
        const res = createAudioResource(this.filePath, { metadata: this });
        log.info(`${this.filePath} transform edges: [${res.edges.map((o) => o.type).join(', ')}]`);
        return res;
    }
}
