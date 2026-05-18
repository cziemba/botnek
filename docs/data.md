# Data / persistence

Single-process lowdb per guild. No multi-writer story — if the bot is scaled beyond one process, the JSON file is the bottleneck.

## `GuildDatabase` — `src/data/db.ts`

Wraps `LowSync<GuildData>` with a lodash chain accessor:

```
class LowWithLodash<T> extends LowSync<T> {
  chain: lodash.ExpChain<this['data']> = lodash.chain(this).get('data');
}
```

`chain` gives every caller a lodash fluent API over `db.data` — `db.chain.get('sfx').get('sounds').set(alias, path).commit()` then `db.write()`. The `commit()` is only required when terminating a chain that mutates; many read paths just `.value()`.

Constructor signature is `new GuildDatabase(filePath)`:

1. Build a `JSONFileSync<GuildData>` adapter at `filePath`.
2. Seed with `DEFAULT_GUILD_DATA`.
3. Read-or-create: `db.read()`, default fallback, immediate `db.write()`.
4. Sanity-check the file was actually written.

One `GuildDatabase` per guild lives in `Botnek.databases` (`GuildResource<GuildDatabase>`). Instantiation happens in `initGuildResources(guildId, dataRoot)` on `clientReady` or lazily on first command.

## Schema — `src/data/types.ts`

```
type GuildData = {
  sfx: SfxConfig;          // { sounds: { [alias]: path } }
  webhooks: WebhookConfig; // { [channelId]: [{ hookName, id, token }] }
  emoteConfig: EmoteConfig; // { emotes: { [alias]: Emote } }
};
```

### `SfxConfig`

Key = `SfxAlias` (branded string, regex `/^[a-z0-9]{1,20}$/`, enforced via `isValidSfxAlias`). Value = the path to the *base* mp3, **relative to the guild dir** `${dataRoot}/${guildId}/` (typically `sounds/<slug>.mp3`). Resolved at read time via `resolveSfxPath` in `src/data/sfxPaths.ts`. Modifier variants produce sibling files in `${guildDir}/ffmpeg/` and aren't tracked in the db.

Historical note: values used to be absolute paths, which broke any time the bot's data root moved (Pi → Docker → new host). `Botnek.initGuildResources` runs `migrateSfxSounds` on boot to rewrite absolute paths that contain the guildId as a path segment; legacy absolutes that survive the migration (no guildId marker) are still tolerated by `resolveSfxPath` but won't survive a host move on their own.

Reserved aliases: `['random']` (see `RESERVED_ALIAS` in `sfx/add.ts`). Don't add more reserved names without also updating `parseSfxAlias`.

Modifiers live as an enum `SfxModifier` (`UNKNOWN / TURBO / TURBO2 / SLOW / SLOW2 / BASS / BASS2`). `isSfxModifier(raw)` returns `UNKNOWN` for anything not in the enum; callers filter those out.

### `WebhookConfig`

`{ [channelId]: { hookName, id, token }[] }`. Only one hook name is actually used today: `emojiHook` (`EMOTE_HOOK_NAME` in `commands/emote.ts`). Array-of-hooks is future-proofing — the current emote path always does `.find({ hookName: 'emojiHook' })`.

Token storage: `webhook.token` is persisted plaintext in `db.json`. That's load-bearing — the whole point is the bot can send through the hook from any process after a restart. Keep `db.json` off shared filesystems.

### `EmoteConfig`

Managed exclusively through `EmoteConfigManager`. Never reach into `db.chain.get('emoteConfig')` from command code; use the manager so the lazy-init of the `emotes` sub-object stays in one place.

## Dataroot layout

See `architecture.md` for the full tree. Key points for data maintenance:

- `${dataRoot}/emotes/` is shared across all guilds (one cache, keyed by emote id). Safe to delete entirely — it will refill on next fetch.
- `${dataRoot}/<guildId>/ffmpeg/` is a regeneration cache. Safe to delete to reclaim space.
- `${dataRoot}/<guildId>/sounds/` is **not** safe to delete — the db references these paths directly. Deleting files there will break `/sfx play` for every affected alias. If you must GC, also `/sfx del` the orphan aliases.
- `${dataRoot}/<guildId>/db.json` is the source of truth for that guild. Back it up.

## Branded-string pattern

`SfxAlias` and `EmoteAlias` both use `string & { __validFooAlias: true }`. The branding is only enforced by the `isValidSfxAlias` / `isEmoteAlias` type guards — every string-typed value from user input or the DB must go through the guard before being passed where an alias type is expected. TypeScript will not catch this for you if you non-null-assert or cast around it.
