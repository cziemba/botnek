// Per-guild owner of the @discordjs/voice AudioPlayer + VoiceConnection + AudioQueue.
// One instance per guild, constructed eagerly at boot and held in BotShim.audioHandlers.
//
// Invariants a reader must respect:
//   - The VoiceConnection is lazy: created on first play, destroyed on stop() / idle timeout.
//     Never hold an external reference to `connection` across state transitions; it can be
//     swapped for a fresh object on rejoin or nulled out by the Destroyed handler.
//   - playNextFromQueue is serialised by `queueLock`; treat the queue as single-consumer.
//   - The connection's stateChange handler is what actually starts playback after a join.
//     playRequest only kicks off the join + handler registration; the player.play() call
//     happens later, inside the Connecting/Signalling -> Ready transition.
//   - Discord requires the bot to be Ready in voice before it will accept an AudioResource;
//     calling player.play() pre-Ready silently no-ops, which is why the Ready wait exists.

import {
    AudioPlayer,
    AudioPlayerState,
    AudioPlayerStatus,
    DiscordGatewayAdapterCreator,
    VoiceConnection,
    VoiceConnectionDisconnectReason,
    VoiceConnectionState,
    VoiceConnectionStatus,
    entersState,
    joinVoiceChannel,
} from '@discordjs/voice';
import { GuildMember } from 'discord.js';
import { promisify } from 'node:util';
import log from '../logging/logging';
import AudioQueue, { AudioRequest } from './audioQueue';

const wait = promisify(setTimeout);

const { Connecting, Destroyed, Disconnected, Signalling, Ready } = VoiceConnectionStatus;

const { Idle } = AudioPlayerStatus;

// 5 minutes of empty queue + Idle player before we leave the channel. Long enough that
// back-to-back manual plays don't flap the connection, short enough that the bot doesn't
// linger silently in someone's room overnight. Tunable via constructor for tests.
export const IDLE_DISCONNECT_MS = 5 * 60 * 1000;

export default class AudioHandler {
    private readonly player: AudioPlayer;

    private readonly queue: AudioQueue;

    private connection?: VoiceConnection;

    // Held while playNextFromQueue is mid-flight so re-entrant calls (e.g. from the player's
    // Idle stateChange firing during playRequest setup) don't double-pop the queue.
    private queueLock: boolean = false;

    // Held while we're inside the Connecting/Signalling -> Ready transition. The voice
    // connection emits multiple intermediate state changes during a single join; without
    // this guard we'd kick off parallel `entersState(Ready)` waits and play the same track
    // multiple times.
    private readyLock: boolean = false;

    private idleTimer?: NodeJS.Timeout;

    private readonly idleTimeoutMs: number;

    constructor(idleTimeoutMs: number = IDLE_DISCONNECT_MS) {
        this.idleTimeoutMs = idleTimeoutMs;
        this.queue = new AudioQueue();
        this.player = new AudioPlayer();

        // The Idle transition is the queue's primary clock: every track end (natural,
        // skipped, or errored) flips the player to Idle, and that transition is what
        // pulls the next request. Filtering out Idle->Idle keeps us from looping on
        // spurious self-transitions emitted during teardown.
        this.player.on(
            'stateChange',
            async (oldState: AudioPlayerState, newState: AudioPlayerState) => {
                log.debug(`AudioPlayer State: ${oldState.status} -> ${newState.status}`);
                if (
                    newState.status === AudioPlayerStatus.Idle &&
                    oldState.status !== AudioPlayerStatus.Idle
                ) {
                    await this.playNextFromQueue();
                }
            },
        );

        this.player.on('error', (error) => {
            log.error(`Error: ${error.message}`);
        });
    }

    public async enqueue(request: AudioRequest): Promise<void> {
        log.debug(`Enqueuing ${request.track.title}`);
        // Cancel before push: a fresh enqueue must not race a pending idle-timer firing
        // and yanking the connection out from under the about-to-play track.
        this.cancelIdleTimer();
        this.queue.enqueue(request);
        log.debug(`Current queue: [${this.queue.queue.map((r) => r.track.title).join(',')}]`);
        await this.playNextFromQueue();
    }

    /**
     * Hard stop: wipe queue, kill player, tear down the voice connection.
     */
    public stop() {
        // Hold the lock across the full teardown so a stateChange-driven playNextFromQueue
        // can't sneak in and try to play from the (just-cleared) queue on a (just-destroyed)
        // connection.
        this.queueLock = true;
        this.cancelIdleTimer();
        this.queue.clear();
        this.player.stop(true);
        if (this.connection && this.connection.state.status !== Destroyed) {
            this.connection.destroy();
        }
        this.queueLock = false;
    }

    public skip(): boolean {
        // player.stop(true) flips us to Idle; the stateChange handler then drains the next
        // queued track. Don't manually call playNextFromQueue here — it would race the
        // handler and trip queueLock.
        return this.player.stop(true);
    }

    public pause(): boolean {
        return this.player.pause(true);
    }

    public resume(): boolean {
        return this.player.unpause();
    }

    public getQueueSnapshot(): { nowPlaying?: string; upcoming: string[] } {
        const upcoming = this.queue.queue.map((r) => r.track.title);
        // The player's state shape varies with status (Idle has no `resource`, Playing/Paused do).
        // Cast through the minimal shape we care about rather than narrowing every status branch.
        // Track subclasses set themselves as `metadata` on the AudioResource so the title survives
        // the round-trip through @discordjs/voice.
        const playingTitle = (this.player.state as { resource?: { metadata?: { title?: string } } })
            .resource?.metadata?.title;
        return { nowPlaying: playingTitle, upcoming };
    }

    public isPaused(): boolean {
        return this.player.state.status === AudioPlayerStatus.Paused;
    }

    /**
     * Pop the next request and play it. Two early exits matter:
     *   - queueLock held: another playNextFromQueue is already mid-flight (or stop() is
     *     tearing down). Bail; the in-flight call (or its stateChange-triggered successor)
     *     will pick up our enqueue.
     *   - player not Idle: something is currently playing. The Idle stateChange listener
     *     in the constructor will re-invoke us when the current track finishes.
     *
     * On exception, we release the lock and recurse immediately so a single bad track
     * (e.g. dead YouTube URL) doesn't wedge the queue — it gets logged and skipped.
     */
    private async playNextFromQueue(): Promise<void> {
        if (this.queueLock || this.player.state.status !== Idle) {
            log.debug(`queueLock=${this.queueLock}, playerStatus=${this.player.state.status}`);
            return;
        }

        if (this.queue.isEmpty()) {
            // Don't tear down on drain — back-to-back plays would pay the full join cost
            // (gateway voice handshake, UDP discovery, ~1-2s of dead air) every time.
            // Arm a timer instead so the connection stays warm for likely-imminent enqueues.
            if (this.connection && this.connection.state.status !== Destroyed) {
                this.armIdleTimer();
            }
            return;
        }

        this.queueLock = true;

        const nextRequest = this.queue.nextRequest()!;
        try {
            log.debug(`Playing request: ${nextRequest.track.title}`);
            await this.playRequest(nextRequest);
            this.queueLock = false;
        } catch (err) {
            log.error(err);
            this.queueLock = false;
            // Skip past the failed track immediately rather than leaving the queue stalled
            // until the next enqueue. Recursion depth is bounded by queue length.
            await this.playNextFromQueue();
        }
    }

    private armIdleTimer(): void {
        this.cancelIdleTimer();
        log.debug(`Arming idle disconnect timer for ${this.idleTimeoutMs}ms`);
        this.idleTimer = setTimeout(() => {
            this.idleTimer = undefined;
            // Re-check every condition at fire time: an enqueue could have arrived between
            // the timer being scheduled and this callback running, and cancelIdleTimer is
            // best-effort (the callback can already be queued by the event loop).
            if (
                this.queue.isEmpty() &&
                this.player.state.status === Idle &&
                this.connection &&
                this.connection.state.status !== Destroyed
            ) {
                log.info(`Idle for ${this.idleTimeoutMs}ms, destroying voice connection`);
                this.connection.destroy();
            }
        }, this.idleTimeoutMs);
        // unref so an idle bot doesn't block process exit on SIGTERM. The optional-chain
        // guards test environments where setTimeout returns a number rather than a Timeout.
        this.idleTimer.unref?.();
    }

    private cancelIdleTimer(): void {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = undefined;
        }
    }

    /**
     * Resolve the user's current voice channel, ensure the connection is parked there,
     * and arrange for `track` to start playing once Ready.
     *
     * The "arrange for" matters: the play() call may happen synchronously (already in the
     * right channel) or deferred into the connection's stateChange handler (joining or
     * moving). The two paths look asymmetric but produce the same end state — player
     * subscribed to connection, AudioResource flowing.
     *
     * The interaction's voice state is re-read at play-time, not enqueue-time, because
     * the user may have moved channels (or left) while waiting in the queue.
     */
    private async playRequest({ interaction, track }: AudioRequest): Promise<void> {
        if (!interaction || !track) {
            throw new Error('Interaction or track is undefined!');
        }
        if (!(interaction.member instanceof GuildMember)) {
            throw new Error('Interaction is not from a guild member');
        }
        const userChannel = interaction.member.voice.channel;
        const userGuild = interaction.guild;
        if (!userChannel || !userGuild) {
            throw new Error('Request expired? User is not in a channel/guild');
        }
        log.debug(
            `Processing audio request for channel[${userChannel.id}] in guild[${userGuild.id}]`,
        );

        // Three cases collapse into the same "establish a fresh connection" branch:
        //   - we never had one;
        //   - the previous one was destroyed (idle timeout, error, manual stop);
        //   - the user is in a different channel than we're parked in.
        // joinVoiceChannel handles the third case as a move, not a full re-join, but the
        // lifecycle handler registration is identical either way.
        if (
            !this.connection ||
            this.connection.state.status === Destroyed ||
            this.connection.joinConfig.channelId !== userChannel.id
        ) {
            if (!this.connection || this.connection.state.status === Destroyed) {
                log.debug('Not in a channel! Joining.');
            } else {
                log.debug('Joining the right channel.');
            }

            this.connection = joinVoiceChannel({
                channelId: userChannel.id,
                guildId: userGuild.id,
                selfDeaf: false,
                selfMute: false,
                adapterCreator: interaction.guild
                    .voiceAdapterCreator as DiscordGatewayAdapterCreator,
            });

            log.debug('Connection created, registering lifecycle events.');
            this.connection.on('error', (error) => {
                log.error(error.message);
            });

            // FOOTGUN: this listener is re-registered on every fresh connection. That's
            // fine when `joinVoiceChannel` returns a new VoiceConnection object (the usual
            // case after Destroyed). If you ever change the branch above to reuse an
            // existing connection, watch for listener accumulation — discord.js does NOT
            // dedupe.
            this.connection.on(
                'stateChange',
                async (oldState: VoiceConnectionState, newState: VoiceConnectionState) => {
                    log.debug(`Connection state: ${oldState.status} -> ${newState.status}`);
                    if (!this.connection) {
                        log.error('No connection to act upon!');
                        return;
                    }
                    if (newState.status === Disconnected) {
                        if (
                            newState.reason === VoiceConnectionDisconnectReason.WebSocketClose &&
                            newState.closeCode === 4014
                        ) {
                            // 4014 = "Disconnected" from Discord side, almost always
                            // because the bot got moved between channels. discord.js will
                            // naturally re-enter Connecting; if it doesn't within 5s,
                            // assume it's a real kick (channel deleted, perms revoked)
                            // and tear down rather than spin retrying.
                            try {
                                await entersState(this.connection, Connecting, 5_000);
                            } catch {
                                this.connection.destroy();
                            }
                        } else if (this.connection.rejoinAttempts < 2) {
                            // Linear backoff (5s, 10s) on transient drops. Two retries is
                            // a tradeoff: long enough to ride out a network blip, short
                            // enough that "the bot is broken" gets surfaced fast.
                            await wait((this.connection.rejoinAttempts + 1) * 5_000);
                            this.connection.rejoin();
                        } else {
                            this.connection.destroy();
                        }
                    } else if (newState.status === Destroyed) {
                        // Connection ended (by us, by Discord, or by the rejoin path
                        // above). Funnel through stop() so we also flush the queue and
                        // the player — otherwise the next enqueue would create a fresh
                        // connection but the queue would still hold stale requests from
                        // the dead session.
                        this.stop();
                    } else if (
                        !this.readyLock &&
                        (newState.status === Connecting || newState.status === Signalling)
                    ) {
                        // The actual "start the music" path. Joining moves through
                        // Signalling -> Connecting -> Ready; we ride the first transition
                        // we see (whichever the connection emits first) and wait for
                        // Ready. readyLock prevents us from double-arming the wait when
                        // both Signalling and Connecting fire on the same join.
                        this.readyLock = true;
                        try {
                            // 20s is generous but Discord's voice handshake can be slow
                            // under load. Lower this and you'll get spurious "did not
                            // ready" failures on cold starts.
                            await entersState(this.connection, Ready, 20_000);
                            this.connection.subscribe(this.player);
                            // Resolve the audio resource AFTER Ready, not before:
                            // YoutubeTrack opens a live HTTP stream here, and we don't
                            // want that stream sitting open for 20s if the connection
                            // never readies.
                            const audioResource = await track.getAudioResource();
                            this.player.play(audioResource);
                        } catch (err) {
                            log.warn(
                                `${!err ? 'Connection did not ready within time limit!' : err}`,
                            );
                            if (this.connection.state.status !== Destroyed) {
                                this.connection.destroy();
                            }
                            // Re-throw so playNextFromQueue's catch fires and we skip
                            // ahead to the next track instead of stalling.
                            throw err;
                        } finally {
                            this.readyLock = false;
                        }
                    }
                },
            );
        } else {
            // Already parked in the right channel and Ready. No state-machine dance
            // needed — fetch the resource and hand it straight to the player.
            const audioResource = await track.getAudioResource();
            this.player.play(audioResource);
        }
    }
}
