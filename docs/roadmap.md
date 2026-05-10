# Roadmap

Drafted 2026-04-19 after the first cleanup pass. Ordered roughly by expected value-per-effort within each section, not strict priority. Small / Medium / Large effort tags are eyeballed on a weekend-project scale.

Items listed only here — not in `staleness.md` — are net-new. `staleness.md` tracks known rot; this doc tracks forward-looking work.

## Near-term finish-the-cleanup

Things already known-broken or half-done. Do these before layering on new features.

- **[S] Fix `/sfx add` trimmed-range check** (`src/commands/sfx/add.ts:126-138`). The nested conditional can accept windows longer than `MAX_SFX_LENGTH_SECONDS`; collapse to `min(endAt, videoLength) - (startAt ?? 0) > MAX`. Already in `staleness.md`.
- **[S] Migrate `ephemeral: true` → `flags: MessageFlags.Ephemeral`** across `src/commands/`. Deprecation warnings today, breakage later.
- **[S] Make log level configurable** via `BotnekConfig` or env var. Currently hard-coded `trace` in `src/logging/logging.ts`.
- **[S] Drop `// @ts-ignore` on `stateChange` listeners** in `src/audio/audioHandler.ts`. Either cast the args or widen the handler type.
- **[M] Migrate 7TV gateway to the v3 GraphQL API**. v2 is EOL'd — ingestion will break without warning. Keep the `EmoteGateway.tryParseUrl`/`fetchEmote` seam stable so this is isolated.
- **[M] ytdl-core resilience**. The integration test already fails on live YouTube. Options: auto-fallback to a shelled-out `yt-dlp` when `@distube/ytdl-core` returns "no playable formats"; OR add a retry with a different agent; OR pin the fork version and just accept periodic bumps. `yt-dlp` fallback is probably the sturdiest move.

## Audio / SFX

The existing SFX engine is the bot's most-used feature. These are natural extensions.

- **[S] `/skip`, `/pause`, `/resume`, `/queue`.** Today only `/stop` exists — you can't peek at what's queued or advance past a single track without flushing the whole queue. The `AudioQueue` already supports inspection; just needs surface area.
- **[S] Auto-disconnect on idle.** After N minutes of an empty queue, leave the voice channel. Prevents the bot sitting in an empty room holding a voice connection.
- **[S] `/sfx remove <alias>`.** Verify this exists — if not, add, gated to admin (see below). `/sfx add` is freely available; symmetry matters.
- **[S] `/sfx search <term>`.** Fuzzy alias matching with a Discord select menu. Already paying the ingestion cost; browsing is a UX gap.
- **[M] Per-SFX volume.** Store a gain factor in the per-guild db, apply via ffmpeg `volume` filter in the chain. Users will inevitably add loud-vs-quiet clips and want parity.
- **[M] Fade in/out modifier.** Add to the existing modifier parser in `src/commands/sfx/common.ts` (same place `speed` and `bass` live). `afade` filter in ffmpeg is trivial.
- **[M] Pre-warm / pre-download on enqueue.** YouTube resolution latency at play-time causes dead air. Kick off `getInfo` + stream-to-disk as soon as the track is queued; play from the cached file when its turn arrives.
- **[M] Seek within the current track.** `/seek <mm:ss>` during playback. Requires re-creating the audio resource at an offset — `@discordjs/voice` supports this via `createAudioResource` with `seek` inline options for FFmpeg-piped streams.
- **[L] Playlist support for `/play`.** YouTube playlist URLs currently fail silently or only grab the first item. Expand into individual tracks and enqueue.

## Emotes

- **[S] Periodic cache sweep for `${dataRoot}/emotes/`.** Scan db files across guilds, delete orphans. Run on boot or on a daily timer. Tracked in `staleness.md` but worth calling out here because the disk will silently grow without it.
- **[M] Handle multi-emote messages.** Existing `// TODO` in `src/bot.ts:tryHandleEmote`. ImageMagick `anim_mods` can stitch; alternatively send multiple webhook messages.
- **[M] Paginated `/emote list`.** Today it dumps a single message; guilds with many emotes will overflow Discord's 2000-char limit.
- **[L] Bulk-import from a Twitch channel.** Given a Twitch channel name, pull its 7TV emote set and add all of them with one command. This is the killer feature for a new-server setup.

## Claude (`/claude`)

Just migrated — lots of low-hanging polish now that the SDK is in place.

- **[S] `/claude reset`** to clear the current guild's rolling conversation without waiting for the 5-minute TTL.
- **[S] Per-guild system prompt** in the guild db. Lets server owners flavor the bot ("you are a sarcastic pirate"). Stable content → cache with `cache_control: { type: "ephemeral" }` for real prompt-cache hits.
- **[S] Log token usage**. `response.usage` has `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` — emit these at debug level so it's easy to tell when caching is actually hitting.
- **[M] Vision passthrough.** If the invoking message has image attachments, pass them as `image` content blocks. Discord already delivers attachment URLs; Anthropic SDK accepts URLs directly.
- **[M] Model/effort selection.** Optional slash options: `model: opus|sonnet|haiku`, `effort: low|medium|high|max`. Default stays `claude-opus-4-7` + default effort. Nice for quick/cheap queries.
- **[L] Tool use: let Claude drive other bot commands.** `/claude play this lofi mix: <url>`, `/claude add a sfx of that one goose honk from the classic video`. Bind SFX/play/emote handlers as Anthropic tools. Biggest feature unlock but needs careful permissioning — don't let the model delete emotes.

## Infrastructure & safety

- **[S] Role-gate destructive commands.** `/sfx remove`, `/emote remove`, any future `/sfx wipe`. Check `interaction.memberPermissions.has('ManageGuild')` or a configured role. Right now any guild member can nuke the library.
- **[S] Auto-redact bot token and `anthropicApiKey` from pino output.** `pino` supports `redact` config — add the known key paths so a panicked `log.error({config})` can't leak secrets.
- **[M] Migrate shell-outs to `spawn` with arg arrays** in `src/utils/ffmpeg.ts` and `src/utils/imagemagick.ts`. Current inputs are alias-sanitized / md5-hashed, but template-literal shell strings are a standing footgun. Closes the injection surface once and for all.
- **[M] Graceful shutdown.** Trap `SIGTERM`, stop all `AudioHandler` voice connections, flush lowdb writes, then exit. Today `pm2 restart` kills mid-write; lowdb's atomic writer usually saves us but not always.
- **[M] CI.** GitHub Actions running `npm run build`, `npm run lint`, and `npm test` (unit tests only — exclude `*.integration.test.ts` so live-YouTube flakiness doesn't break PRs). Gate on the existing `mainline` → `main` merge.
- **[M] Integration-test strategy.** The live YouTube test is flaky-by-design. Options: (a) mark those tests `skipIf(process.env.CI)`; (b) stand up a local fixture that mimics ytdl-core's streaming output; (c) gate with a `RUN_INTEGRATION=1` env var and document that it's developer-invoked only. Pick one; the current state is "half-disabled in coverage but not in the test runner," which surfaces failures without useful signal.
- **[M] Schema migrations for the per-guild db.** Today any shape change to `GuildData` silently breaks old guilds on first read. Introduce a `schemaVersion` field and a small `migrate(data, fromVersion)` pipeline.
- **[L] Replace README drift with a single source.** Either grow `README.md` to cover the runtime deps + config fields, or collapse `README.md` → `docs/README.md` and have a one-paragraph repo README that links into `docs/`.

## Observability

- **[S] `/stats` command.** Current queue length, what's playing, DB size per guild, process uptime, memory RSS. Useful debugging and a nice morale-boosting feature.
- **[M] Per-guild audit log in db.** Append `{command, userId, timestamp}` on every handler invocation. Rolling window (last 100 entries). Lets you answer "who added that terrible sfx" without scrolling Discord.
- **[M] File-based pino transport in prod.** `pino-pretty` to stdout is fine for dev; prod should rotate to a file and keep, say, 7 days. pm2 already captures stdout but without rotation.

## Speculative

Things that sound fun but I'd do last, if at all.

- **Voice-triggered SFX.** Listen to the voice channel, detect a spoken alias, play the sfx. Would need a whisper integration; latency and false-positive noise probably make it worse than it sounds.
- **Cross-guild sound sharing.** Opt-in "public" sfx that any guild can pull. Changes the single-process-per-guild isolation model significantly; only worth it if the bot ever grows past one social circle.
- **Web UI.** Dashboard for browsing/managing sfx & emotes instead of slash commands. Natural fit for a React+Express add-on, but a big surface-area expansion for a bot that currently has zero HTTP attack surface.
