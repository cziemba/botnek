import { CommandInteraction, Message } from 'discord.js';
import Track from './tracks/track';

export interface AudioRequest {
    interaction: CommandInteraction<'cached'> | Message<true>; // TODO: ValidatedInteraction, an interaction with non-null user, channel and guild
    track: Track;
}

export default class AudioQueue {
    public queue: AudioRequest[];

    constructor() {
        this.queue = [];
        this.queue.shift();
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
