# Commands

Registered in `src/commands.ts`. Every command supports both `/name` and `!name` dispatch. The help embed is assembled separately in `src/commands/help.ts` — keep it in sync when adding/removing commands.

## `/play <url>` — `src/commands/play.ts`

Enqueue a YouTube URL for streaming playback in the caller's current voice channel.

- Rejects non-YouTube URLs via `YoutubeTrack.checkUrl` (delegates to `ytdl.validateURL`).
- Requires the user to be in a voice channel; enforced inline (not via `requireUserInChannel`).
- Calls `YoutubeTrack.fromUrl` (network) to hydrate metadata, then `audioHandler.enqueue`.
- Streams directly via `ytdl(url, { filter: 'audioonly', dlChunkSize: 0 })` — no intermediate file.

## `/stop` — `src/commands/stop.ts`

Calls `AudioHandler.stop()` — clears the queue, stops the player, destroys the voice connection.

## `/sfx` — `src/commands/sfx.ts` (+ `src/commands/sfx/`)

Parent command with subcommands. Subcommand handlers live in `src/commands/sfx/*.ts`.

| Subcommand | Handler | Notes |
|---|---|---|
| `list` | `sfx/list.ts` | Alphabetized, chunked 10/line, ephemeral. |
| `add <alias> <url> [start] [end]` | `sfx/add.ts` | YouTube-only. Max 30s clip enforced. `RESERVED_ALIAS` = `['random']`. Times accept `HH:MM:SS`, `XmYs`, or bare seconds — parsed by `momentParse`. |
| `del <alias>` | `sfx/del.ts` | Removes db entry and the base file from disk. |
| `play <alias>` | `sfx/play.ts` | Supports `alias#MOD#MOD` (up to 2 mods). Falls through to `sfxPlay` with the parsed pair. |
| `chain <list>` | `sfx/chain.ts` | Split on spaces or commas; up to 5 entries. |
| `help` | `sfx/help.ts` | Static embed. |

Shared helpers in `sfx/common.ts`:

- `parseSfxAlias` — split on `#`, normalize, validate, cap modifiers to 2.
- `normalizeAliasInput` — substitutes the reserved `random` alias.
- `handleModifiers` — applies `SfxModifier` values in order, chaining ffmpeg filter invocations. Each modifier returns a new file path, which is fed into the next.
- `sfxAliasToString`, `sfxExists`, `loadSfxPath`, `randomSfxAlias`.

Supported modifiers (enum `SfxModifier`): `TURBO` (x4/3), `TURBO2` (x2), `SLOW` (x3/4), `SLOW2` (x1/2), `BASS` (50db/20db), `BASS2` (80db/40db). Mapped to ffmpeg filters in `utils/ffmpeg.ts` (`asetrate` for speed, `firequalizer` for bass).

**Prefix-route quirk**: if the first arg doesn't match a known subcommand, it's treated as an alias — so `!sfx yay` is equivalent to `!sfx play yay`.

## `/emote` — `src/commands/emote.ts`

Webhook-based emote replacement. Discord-server emoji cap doesn't apply — these are posted as gif attachments by a webhook that impersonates the sending user.

Subcommands:

- `enable` — create a channel webhook named `emojiHook` and record `{ id, token, hookName }` in `guildData.webhooks[channelId]`. Idempotent.
- `disable` — **stub**, replies "not implemented yet".
- `list` — list all configured emote aliases with links back to 7TV / BTTV.
- `add <url> [alias]` — delegate URL to both gateways' `tryParseUrl`; whichever matches handles the fetch. On success stores `{ id, defaultAlias, source }` keyed by alias in the db.
- `remove <alias>` — delete from `EmoteConfigManager`. Note: does **not** delete the cached gif from `${dataRoot}/emotes/` (shared cache across guilds).

Auto-dispatch on non-`!` messages runs through `Botnek.tryHandleEmote` → `src/commands/emotes/emote.ts#handleSingleEmote`, which deletes the user's message and reposts via the webhook with the cached gif.

## `/emoji add <url> [alias]` — `src/commands/serverEmoji.ts`

Same URL-to-emote pipeline as `/emote add`, but uploads the result as a real Discord server emoji via `guild.emojis.create`. If the gif is too big, retries once after re-running it through `convertToGif` at `64x64^`. Gives up after two attempts.

## `/gpt <text>` — `src/commands/chatgpt.ts`

Thin ChatGPT passthrough via the (now-deprecated) `chatgpt` npm package. Uses the first token from `config.chatGptTokens`. Module-scoped state for `api`, `conversation.id`, `conversation.expiry` (5-min rolling TTL). See `staleness.md` — this module needs replacement.

## `/help` — `src/commands/help.ts`

Builds an ephemeral embed from a hard-coded command list (**not** from `src/commands.ts`). Also exposed as `helpMsgOptions()` and posted (+ kept up-to-date) in the `#botnek2-help` channel on every `clientReady`.
