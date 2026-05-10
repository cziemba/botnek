# Staleness / known rot

Catalogued during the initial agentic sweep. Not a TODO list — a starting point for the cleanup pass. Each item lists where to look and a rough severity.

First cleanup pass ran on 2026-04-19 — resolved items have been deleted from this doc; remaining items are still open.

## Bugs

### Sound-channel check in `/sfx add` doesn't size-validate the trimmed range — `src/commands/sfx/add.ts:126-138`

The nested length checks only reject when `videoLengthSeconds - startFromSeconds > MAX` AND `(!endAtSeconds || endAtSeconds - startFromSeconds > MAX)`. The logic short-circuits on `endAtSeconds` being set at all and can accept a trimmed window longer than `MAX_SFX_LENGTH_SECONDS` if the *remaining* video from `startFromSeconds` also exceeds the cap in a specific shape. Worth a rewrite for readability — simpler: reject when `min(endAt, videoLength) - (startAt ?? 0) > MAX`. **Low**.

### `/emote remove` leaves the cached gif on disk — `src/commands/emote.ts`

Caching is global (shared across guilds), so removing from one guild's config shouldn't delete the file. But there is **no** GC path anywhere — removed-in-every-guild emotes accumulate forever under `${dataRoot}/emotes/`. Needs a refcount or periodic sweep. **Low**.

## Dependency / platform rot

### 7TV API v2 is deprecated

`api.7tv.app/v2` is deprecated upstream. v3 (GraphQL) is the current. Emote ingestion still works as of last check, but expect breakage. Either port to v3 or drop 7TV support. **Medium**.

### `ytdl-core` forks come and go

Project already migrated from `ytdl-core` to `@distube/ytdl-core` (commit `e556858`). This is a permanent rearguard action — expect to have to swap forks again. Keep the `YoutubeTrack.checkUrl` / `YoutubeTrack.fromUrl` seam clean so the swap stays isolated.

As of 2026-04-19 the `youtubeTrack.integration.test.ts` live-download test is failing with `Failed to find any playable formats` — either the current `@distube/ytdl-core` version needs a bump, or the fork is already behind YouTube again.

### Discord.js `ephemeral: true` is deprecated

Replace with `flags: MessageFlags.Ephemeral`. Used widely across `src/commands/`. Low-priority but will emit warnings / eventually break. **Low**.

## Code smells

- **`// @ts-ignore` on `stateChange` listeners** — `src/audio/audioHandler.ts:38, 154`. Fix the types (the discord-voice signature is `(oldState: VoiceConnectionState, newState: VoiceConnectionState)`; cast the arg explicitly or widen).
- **`!` non-null assertions on db access** — `client.databases.get(guildId)?.db!` is everywhere. Given `GuildResource.get` throws on miss already, the `?.` is redundant; pick one style.
- **Command-injection shape in ffmpeg / imagemagick shell-outs** — all shelled strings are built via template literals with unquoted paths. Currently safe because inputs are sanitized aliases / md5 digests, but it's a footgun. Either shell-escape or switch to `spawn` with arg arrays.
- **`logging.ts` is level=`trace` unconditionally** — no way to quiet logs in prod short of piping through pino-pretty's filter. Make level configurable (env var or `BotnekConfig`).
- **`interaction.reply` in a promise-chain `.catch(...)`** in `/sfx add` — if the reply throws (e.g. interaction expired after a long YouTube download), the error is swallowed. Use `interaction.editReply` after an initial `deferReply`.

## Docs / README drift

`README.md` covers only `BotnekConfig`. It doesn't mention:

- The bot now uses `anthropicApiKey` (single Anthropic API key) instead of the historical `chatGptTokens` array (migrated 2026-04-19).
- The bot requires ffmpeg, ffprobe, ImageMagick, and `file` on `$PATH`.
- `dataRoot` must be writable; the bot creates subdirectories aggressively.
- Commands are guild-scoped; adding the bot to a new guild requires a restart to publish commands there.

Fold these into README.md or collapse README → `docs/`.

## Cleanup history

**2026-04-19** — first hygiene pass resolved the following:

- `chain.ts` inverted bad-sfx filter (`!!sfx.path` → `!sfx.path`).
- `bot.ts` used `interaction.followUp` on the unknown-command miss path with no prior reply (now `interaction.reply`).
- `chatgpt.ts` / `chatgpt` npm package replaced with `src/commands/claude.ts` built on `@anthropic-ai/sdk`. Per-guild conversation state (5-minute idle TTL), Discord 2000-char chunking, uses `claude-opus-4-7` with adaptive thinking. `BotnekConfig.chatGptTokens` renamed to `anthropicApiKey`. Command renamed `/gpt` → `/claude`.
- `YoutubeTrack.saveAudio` `startAtSeconds === 0` no longer treated as absent (checks `!== undefined`).
- 7TV fallback URL picker now dereferences `.urls[1][1]` / `.urls[0][1]` correctly (with optional chaining), instead of indexing the raw response object.
- `audioQueue.ts` constructor no longer calls `.shift()` on an empty array.
- `/emote disable` stub subcommand removed (both slash and prefix paths).
- Command registry consolidated: `src/commands.ts` and `src/commands/help.ts` now share `src/commands/registry.ts` as the single source of truth; `/help` derives its listing from there.
- Emote gateway construction hoisted into the `Botnek` constructor (was re-allocated on every interaction, message, and emote passthrough).
