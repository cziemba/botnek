import {
    AudioPlayer,
    AudioPlayerStatus,
    DiscordGatewayAdapterCreator,
    VoiceConnection,
    VoiceConnectionDisconnectReason,
    VoiceConnectionStatus,
    entersState,
    joinVoiceChannel,
} from '@discordjs/voice';
import { GuildMember } from 'discord.js';
import { promisify } from 'node:util';
import AudioQueue, { AudioRequest } from './audioQueue.ts';
import log from '../logging/logging.ts';

const wait = promisify(setTimeout);

const {
    Connecting, Destroyed, Disconnected, Signalling, Ready,
} = VoiceConnectionStatus;

const { Idle } = AudioPlayerStatus;

export default class AudioHandler {
    private readonly player: AudioPlayer;

    private readonly queue: AudioQueue;

    private connection?: VoiceConnection;

    private queueLock: boolean = false;

    private readyLock: boolean = false;

    constructor() {
        this.queue = new AudioQueue();
        this.player = new AudioPlayer();

        // @ts-ignore
        this.player.on('stateChange', async (oldState, newState) => {
            log.debug(`AudioPlayer State: ${oldState.status} -> ${newState.status}`);
            if (newState.status === AudioPlayerStatus.Idle && oldState.status !== AudioPlayerStatus.Idle) {
                await this.playNextFromQueue();
            }
        });

        this.player.on('error', (error) => {
            log.error(`Error: ${error.message}`);
        });
    }

    public async enqueue(request: AudioRequest): Promise<void> {
        log.debug(`Enqueuing ${request.track.title}`);
        this.queue.enqueue(request);
        await this.playNextFromQueue();
    }

    /**
     * Stop the request processing and empty the queue.
     */
    public stop() {
        this.queueLock = true;
        this.queue.clear();
        this.player.stop(true);
        if (this.connection && this.connection.state.status !== Destroyed) {
            this.connection.destroy();
        }
        this.queueLock = false;
    }

    /**
     * Fetch the next request from the queue, if avail, and play it.
     */
    private async playNextFromQueue(): Promise<void> {
        if (this.queueLock || this.player.state.status !== Idle) {
            log.debug(`queueLock=${this.queueLock}, playerStatus=${this.player.state.status}`);
            return;
        }

        // Nothing left to play, disconnect
        if (this.queue.isEmpty() && this.connection) {
            log.debug('Queue is empty, destroying connection');
            this.connection.destroy();
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
            await this.playNextFromQueue();
        }
    }

    /**
     * Process the AudioRequest:
     * 1. Validate interaction
     * 2. Join the voice channel if not joined already
     * 3. Setup lifecycle events
     * 4. Subscribe player to the connection
     * 5. Play audio resource
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
        log.debug(`Processing audio request for channel[${userChannel.id}] in guild[${userGuild.id}]`);

        // Join the appropriate channel if not already.
        if (!this.connection || this.connection.state.status === Destroyed || this.connection.joinConfig.channelId !== userChannel.id) {
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
                adapterCreator: interaction.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
            });

            log.debug('Connection created, registering lifecycle events.');
            this.connection.on('error', (error) => { log.error(error.message); });

            // @ts-ignore
            this.connection.on('stateChange', async (oldState, newState) => {
                log.debug(`Connection state: ${oldState.status} -> ${newState.status}`);
                if (!this.connection) {
                    log.error('No connection to act upon!');
                    return;
                }
                if (newState.status === Disconnected) {
                    if (newState.reason === VoiceConnectionDisconnectReason.WebSocketClose && newState.closeCode === 4014) {
                        try {
                            await entersState(this.connection, Connecting, 5_000);
                        } catch {
                            this.connection.destroy();
                        }
                    } else if (this.connection.rejoinAttempts < 2) {
                        await wait((this.connection.rejoinAttempts + 1) * 5_000);
                        this.connection.rejoin();
                    } else {
                        this.connection.destroy();
                    }
                } else if (newState.status === Destroyed) {
                    this.stop();
                } else if (!this.readyLock && (newState.status === Connecting || newState.status === Signalling)) {
                    this.readyLock = true;
                    try {
                        await entersState(this.connection, Ready, 20_000);
                        this.connection.subscribe(this.player);
                        const audioResource = await track.getAudioResource();
                        this.player.play(audioResource);
                    } catch (err) {
                        log.warn(`${!err
                            ? 'Connection did not ready within time limit!'
                            : err}`);
                        if (this.connection.state.status !== Destroyed) this.connection.destroy();
                        throw err;
                    } finally {
                        this.readyLock = false;
                    }
                }
            });
        } else {
            const audioResource = await track.getAudioResource();
            this.player.play(audioResource);
        }
    }
}
