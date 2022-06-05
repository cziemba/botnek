import { AudioResource } from '@discordjs/voice';

export default abstract class Track {
    protected constructor(public readonly title: string) {
    }

    public abstract getAudioResource(): Promise<AudioResource>;
}
