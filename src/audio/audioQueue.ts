// Plain FIFO of pending playback requests, owned by AudioHandler. No priority, no dedup.
// Single-consumer in practice — AudioHandler.playNextFromQueue is the only caller of
// nextRequest() and serialises itself with queueLock.

import { CommandInteraction, Message } from 'discord.js';
import Track from './tracks/track';

export interface AudioRequest {
    // The originating interaction is kept on the request (not just the resolved channel)
    // because the user may move between voice channels while the request waits in the
    // queue. AudioHandler.playRequest re-reads `interaction.member.voice.channel` at
    // play-time to follow them.
    // TODO: ValidatedInteraction, an interaction with non-null user, channel and guild —
    // current type leaves channel/guild nullable downstream.
    interaction: CommandInteraction<'cached'> | Message<true>;
    track: Track;
}

export default class AudioQueue {
    // Public for snapshot inspection (AudioHandler.getQueueSnapshot, /queue command).
    // External code MUST treat this as read-only — only call enqueue/clear/nextRequest
    // for mutation, otherwise the lock invariants in AudioHandler stop holding.
    public queue: AudioRequest[];

    constructor() {
        this.queue = [];
    }

    public clear(): void {
        this.queue = [];
    }

    public isEmpty(): boolean {
        return this.queue.length === 0;
    }

    public length(): number {
        return this.queue.length;
    }

    public enqueue(audioRequest: AudioRequest): void {
        this.queue.push(audioRequest);
    }

    public nextRequest(): AudioRequest | undefined {
        return this.queue.shift();
    }
}
