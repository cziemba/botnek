// Polymorphic "thing the AudioPlayer can play" abstraction. Subclasses (LocalTrack,
// YoutubeTrack) decide where the bytes come from; AudioHandler doesn't care.
//
// Convention: subclasses pass `metadata: this` when constructing the AudioResource so
// AudioHandler.getQueueSnapshot can recover the title for "now playing" display.
// Breaking that convention silently breaks the /queue command — there's no compile-time
// enforcement.
//
// getAudioResource is async because resource creation can do real work (network fetch
// for YouTube). Don't call it speculatively at enqueue-time; the resource holds an open
// stream and may time out before it actually reaches the player.

import { AudioResource } from '@discordjs/voice';

export default abstract class Track {
    protected constructor(public readonly title: string) {}

    public abstract getAudioResource(): Promise<AudioResource>;
}
