# Audio

One `AudioHandler` per guild, created eagerly in `Botnek.initGuildResources`. Wraps a single `@discordjs/voice` `AudioPlayer`, an `AudioQueue`, and a possibly-present `VoiceConnection`.

## `AudioQueue` — `src/audio/audioQueue.ts`

Plain FIFO over `AudioRequest` (`{ interaction, track }`). No priority, no dedup. `interaction` is kept on the request so the handler can re-read the caller's voice channel / guild when it's time to play — by the time playback starts, the user may have moved.

## `AudioHandler` — `src/audio/audioHandler.ts`

State:

- `player: AudioPlayer` — one per handler.
- `queue: AudioQueue`.
- `connection?: VoiceConnection` — lazy; created on first play, torn down on `stop()` or when queue drains.
- `queueLock: boolean` — serializes `playNextFromQueue`.
- `readyLock: boolean` — guards the "connection entered Ready" block inside the state-change handler.

Lifecycle:

1. **Enqueue** (`enqueue`) appends the request and calls `playNextFromQueue`.
2. **Dequeue** (`playNextFromQueue`) early-exits if `queueLock` is held or the player is not `Idle`. If the queue is empty and a connection exists, the connection is destroyed. Otherwise pops the next request and calls `playRequest`.
3. **Play** (`playRequest`):
   - Validates interaction → `GuildMember` with a voice channel.
   - Joins the channel if no connection exists, or moves if the existing connection is in a different channel.
   - On the first join, wires `error` and `stateChange` handlers:
     - On `Disconnected` with `WebSocketClose` + code 4014 (moved): try `entersState(Connecting, 5s)`, destroy on failure.
     - Other disconnects: up to 2 retries with linear backoff (`rejoinAttempts * 5s`), then destroy.
     - On `Destroyed`: call `this.stop()`.
     - On `Connecting` / `Signalling`: wait for `Ready` (20s), subscribe the player to the connection, fetch the track's `AudioResource`, and `player.play(resource)`.
   - If the connection is already live on the right channel, just fetch the resource and play directly.
4. **Idle transitions** on the player trigger `playNextFromQueue`, draining the queue.
5. **Stop** (`stop`) sets `queueLock`, clears the queue, stops the player hard, destroys the connection if alive.

Known subtle points:

- `queueLock` is released in both the success and error paths of `playNextFromQueue`; an exception in `playRequest` recurses immediately into `playNextFromQueue` to skip the bad track.
- The `stateChange` listeners are re-registered on every reconnect — but because we only re-enter the "no connection / wrong channel" branch when the connection is missing or destroyed, re-registration generally coincides with a fresh connection object. Still, if you refactor this, watch for listener accumulation.
- Two `// @ts-ignore` on `stateChange` signatures — discord.js v14 types don't line up cleanly with the handler arg types.

## `Track` hierarchy — `src/audio/tracks/`

`Track` (abstract): `{ title: string, getAudioResource(): Promise<AudioResource> }`.

### `LocalTrack`

Wraps a filesystem path; returns `createAudioResource(filePath, { metadata: this })`. Used for sfx (post-ffmpeg output) and any on-disk source.

### `YoutubeTrack`

Uses `@distube/ytdl-core` (switched away from `ytdl-core` proper, which the YouTube team has been breaking repeatedly — see `e556858` and `b001398`).

- `YoutubeTrack.fromUrl(url)` — one `getBasicInfo` call to populate `videoDetails`.
- `YoutubeTrack.checkUrl(url)` — `ytdl.validateURL`.
- `getAudioResource()` — streams `audioonly` directly, no intermediate file.
- `saveAudio(audioStoragePath, startAtSeconds?, endAtSeconds?)` — download path used by `/sfx add`. Writes a base mp3 at a deterministic slug (`<title>.mp3`); if a trim range is given, runs `ffmpegTrimAudio` into a second deterministic location (`<md5(title+args)>.mp3`) and returns that path.

## Post-fx — `src/utils/ffmpeg.ts`

Two public filters plus a trim helper, all via `execSync`:

- `ffmpegAdjustRate(inFile, guildDir, rate)` — `asetrate=44100*rate, aresample=44100`. Rate is a multiplier (e.g. 4/3 for TURBO).
- `ffmpegBassBoost(inFile, guildDir, firstDb, secondDb)` — `firequalizer` with gain entries at 0Hz / 450Hz / 1000Hz. Values are in dB.
- `ffmpegDurationSeconds(inFile)` — `ffprobe` passthrough.
- `ffmpegTrimAudio(inFile, outFile, start?, end?)` — `-ss` / `-to` on the input side.

The first three hit `ffmpegProcessAudio`, which caches to `${guildDir}/ffmpeg/<md5(basename+filter)>.<ext>`. Cache hit = early return. Cache lives **per guild**, not globally — same sfx applied to the same mod on a different guild re-runs ffmpeg.

All shell-outs use string interpolation with unquoted paths. That's a command-injection footgun if any filename ever contains shell metacharacters; currently safe because all paths are bot-controlled (md5 digests / sanitized aliases).
