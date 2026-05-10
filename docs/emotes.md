# Emotes

Two parallel surfaces:

1. **Webhook emotes** (`/emote`) — bot-managed, stored in lowdb, posted as gif attachments via a channel webhook that impersonates the sender. No Discord size limit because they're attachments, not server emojis.
2. **Server emoji** (`/emoji`) — uploaded as real Discord custom emojis via `guild.emojis.create`. Subject to Discord's per-guild emoji cap and 256KiB size limit.

Both surfaces share the same ingestion pipeline (gateway → cache → gif on disk).

## Gateway abstraction — `src/commands/emotes/emoteGateway.ts`

```
abstract class EmoteGateway {
  static readonly EMOTE_DIR = 'emotes';          // under dataRoot
  protected emoteRootPath: string;                // `${dataRoot}/emotes/`
  abstract fetchEmote(id: string): Promise<Emote>;
  abstract tryParseUrl(url: string): string | undefined;
}
```

Shared rules:

- All cached emote files are gifs named `<emoteId>.gif`, regardless of source.
- `${dataRoot}/emotes/` is a single shared directory — emote IDs are globally unique within each source, but if BTTV and 7TV ever collided on an ID, the cached file would be indistinguishable. In practice they don't overlap.
- Concrete gateways are instantiated per handler invocation in `bot.ts`; they carry no per-request state.

### `BetterTTVEmoteGateway` — `betterTTVEmoteGateway.ts`

- URL regex: `http.*(betterttv.com|betterttv.net)/emote(s?)/<id>`.
- Metadata: `GET https://api.betterttv.net/3/emotes/{id}` → `{ id, code, imageType }`.
- Download: `GET https://cdn.betterttv.net/emote/{id}/3x` streamed to `<id>-tmp.<imageType>`, then `extractFrameDelay` + `convertToGif` → `<id>.gif`.

### `SevenTVEmoteGateway` — `sevenTVEmoteGateway.ts`

- URL regex: `http.*(7tv.app)/emote(s)?/<id>`.
- Metadata: `GET https://api.7tv.app/v2/emotes/{id}` → `{ id, name, mime, urls }`.
- Download: picks the highest-resolution URL available from the `urls` table, streams to `<id>-tmp.<ext>`, converts to gif.
- v2 API is deprecated upstream — see `staleness.md`.

## Data model — `src/data/types/emote.ts`

```
type EmoteAlias = string & { __validEmoteAlias: true };   // /^[_\-a-zA-Z0-9]{1,20}$/
enum EmoteSource { SEVENTV, BTTV }
type Emote = { id, defaultAlias, source };
type EmoteConfig = { emotes: { [alias: EmoteAlias]: Emote } };
```

Managed by `EmoteConfigManager` (`src/data/emoteConfigManager.ts`) — a thin wrapper over the lowdb `chain` exposing `put / remove / get / aliasExists / listEmotes`. Constructor ensures the `emoteConfig.emotes` path exists on first write.

## Inline-alias replacement — `src/commands/emotes/emote.ts#handleSingleEmote`

Entry point: `Botnek.tryHandleEmote` (triggered by any non-`!` message that parses as a valid emote alias and matches a stored emote).

Flow:

1. Look up `webhooks[channelId]` for a hook named `emojiHook`.
2. If missing, log a warning and bail — user is told nothing. (Registration is via `/emote enable`.)
3. Build a `WebhookClient` from the stored `{ id, token }`.
4. In parallel: delete the user's original message and `webhookClient.send` with:
   - `avatarURL` = user's avatar (or default).
   - `username` = guild displayName.
   - `files` = the cached gif, named `<alias>.gif` so Discord inlines it.

Thus the emote appears as a normal post "from" the user, at arbitrary size.

## Server-emoji path — `src/commands/serverEmoji.ts`

Same fetch pipeline, then `guild.emojis.create({ attachment: gifPath, name: alias })`. On failure (usually size), re-runs `convertToGif` with `64x64^` resize into `os.tmpdir()` and retries once. Gives up after that with an explanatory reply.

## ImageMagick helpers — `src/utils/imagemagick.ts`

- `extractFrameDelay(inFile)` — `identify -verbose | grep -m1 Delay`, parses `Delay: NxM`, returns `N*M/100` (hundredths of a second). Throws if not animated; callers catch and default to 0 for static images.
- `convertToGif(inFile, outFile, frameTime, resize?)` — `convert <in> -coalesce -resize <resize|112x112^> -delay <frameTime> -dispose previous <out>`. Deletes `inFile` on success.
- `getExtension(inFile)` — `file --mime-type` + `mime.extension`; currently unused by production paths.

Default resize is `112x112^` (height-capped, preserves aspect). Adjust thoughtfully — Discord's server emoji limit is 256KiB, and the retry path already drops to 64x64.
