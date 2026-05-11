// Track backed by a file on disk. Used for both raw sfx outputs and the post-fx outputs
// of the ffmpeg modifier chain (TURBO/BASS/etc). The `filePath` is whatever the
// modifier pipeline produced; LocalTrack doesn't know or care whether it's the original
// download or a cached transform.

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
        // `metadata: this` is what makes AudioHandler.getQueueSnapshot work — the player
        // exposes resource.metadata, and we read .title off it.
        const res = createAudioResource(this.filePath, { metadata: this });
        // Log the transcoder edges @discordjs/voice picked (e.g. ffmpeg vs prism opus
        // demuxer). Useful when debugging "audio plays locally but is silent in voice"
        // — usually means an unexpected transform path.
        log.info(`${this.filePath} transform edges: [${res.edges.map((o) => o.type).join(', ')}]`);
        return res;
    }
}
