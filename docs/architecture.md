# Architecture

## Boot sequence

1. `src/index.ts` imports the static `src/config.json`, logs `generateDependencyReport()` from `@discordjs/voice` (useful for confirming that opus + sodium native bindings are live), constructs `Botnek`, and calls `login`.
2. `Botnek` constructor (`src/bot.ts`) creates a `discord.js` `Client` with four intents — `Guilds`, `GuildVoiceStates`, `GuildMessages`, `MessageContent` — and wires three event handlers:
   - `clientReady` → per-guild bootstrapping.
   - `interactionCreate` → slash-command dispatch.
   - `messageCreate` → `!`-prefix command + bare-emote-alias dispatch.
3. On `clientReady`:
   - Error out if the bot is in zero guilds.
   - Clear global application commands (`rest.put(applicationCommands(clientId), { body: [] })`) — the bot is guild-scoped, not global.
   - For each guild: log `[clientId, guildId]` banner, call `initGuildResources(guildId, dataRoot)`, upsert the `#botnek2-help` channel (`initHelpChannel`), and publish the command list via `applicationGuildCommands`.

Guild-scoped publishing means command changes appear immediately on restart; there's no 1-hour global propagation delay.

## Per-guild resource model

Everything mutable is keyed by `guildId`:

- `GuildResource<AudioHandler>` — one voice queue + connection per guild.
- `GuildResource<GuildDatabase>` — one lowdb file (`${dataRoot}/${guildId}/db.json`) per guild.

`GuildResource` (`src/types/guildResource.ts`) is a thin `Map` wrapper. `get()` throws on missing; callers rely on `initGuildResources` being idempotent and having run in `clientReady` first.

Emote gateways are **not** stored in `GuildResource` — they're instantiated fresh inside every handler dispatch in `bot.ts` (the `emoteGateways: { sevenTvGateway, bttvGateway }` literal on each event). This is wasteful but harmless; see `staleness.md`.

## Event dispatch

### Slash commands (`interactionCreate`)

1. Ignore non-command / non-cached-guild interactions.
2. Look up the command by `interaction.commandName` in the `COMMANDS` array.
3. Call `command.executeCommand(botShim, interaction)`.
4. On miss, `interaction.followUp({ ephemeral: true })` — note this is buggy: `followUp` without a prior `reply`/`deferReply` will fail. See staleness doc.

### Prefix commands (`messageCreate`)

1. Ignore bot messages and DMs (`!message.inGuild()`).
2. If the message does **not** start with `!`, try to handle it as an emote alias (`tryHandleEmote`). This is how 7TV/BTTV aliases auto-replace inline.
3. If it starts with `!`, split on spaces; first token is the command name, rest are positional args.
4. If `command.requireUserInChannel` is set and the user isn't in a voice channel, reply and stop.
5. Call `command.executeMessage(botShim, message, args)`; wrap in try/catch and reply with the error string.

### Bare-emote passthrough (`tryHandleEmote`)

1. Trim content; reject if it's not a valid emote alias (regex in `isEmoteAlias`).
2. Look up the alias in `EmoteConfigManager`.
3. Delegate to `commands/emotes/emote.ts#handleSingleEmote` which deletes the user's message and reposts via the channel's registered webhook with the cached gif attached.

## On-disk layout (`dataRoot`)

```
${dataRoot}/
  emotes/                      # gateway cache, shared across guilds; files keyed by emote id
    <emoteId>.gif
  <guildId>/
    db.json                    # lowdb GuildData
    sounds/                    # YouTube-derived sfx sources
      <slug>.mp3               # base (unfiltered) download, deterministic from title
      <md5(title+trimArgs)>.mp3  # trimmed variant (only when start/end provided)
    ffmpeg/                    # post-fx cache
      <md5(basename+filter)>.mp3
```

Cache keys are content-addressed where possible (md5 of inputs + args), so re-running `/sfx add` or playing with the same modifier chain skips the ffmpeg call. Don't break these key schemes without invalidating the caches.

## Command contract

`src/types/command.ts`:

- `data: SharedSlashCommand` — built with `SlashCommandBuilder`; defines the Discord-side schema.
- `executeCommand(bot, interaction)` — slash path.
- `executeMessage(bot, message, args)` — prefix path; many commands share a single `(client, interaction | message, params)` helper that both entry points call with the args parsed out of the interaction vs. positional args.
- `helpText?` — string rendered in the `/help` embed (and in the bot-managed help channel).
- `requireUserInChannel?` — prefix-route-only gate; slash commands enforce this inside their handlers.

`BotShim` is the dependency bag passed to every handler:

```
{ client, config, audioHandlers, databases, emoteGateways }
```

Treat `BotShim` as stable — adding a new per-request dependency means editing the literal in two places in `bot.ts` plus the interface.
