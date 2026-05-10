# CLAUDE.md

Agentic orientation for the `botnek2` Discord bot. Keep this file short and current — push detail into `docs/`.

## What this is

A single-process Node (ESM, TypeScript, Node ≥22) Discord bot built on `discord.js` v14 and `@discordjs/voice`. Features:

- Sound-effect library per guild (`/sfx`): download YouTube clips, optionally trim, play back with ffmpeg post-fx (speed/bass mods), random + chain support.
- YouTube playback (`/play`) and queue control (`/stop`).
- Twitch-style emotes from 7TV / BTTV, rendered through a channel webhook (`/emote`) or promoted to server emoji (`/emoji`).
- ChatGPT passthrough (`/gpt`) — currently uses the deprecated reverse-engineered `chatgpt` npm package; see `docs/staleness.md`.
- Self-managed `#botnek2-help` channel per guild (created on `clientReady`, message rewritten on boot).

Commands are registered both as Discord slash commands **and** as `!`-prefix message commands; both routes are handled in `src/bot.ts`.

## Run / dev

```
npm start                 # ts-node + pino-pretty, reads ~/.botnek2/config.json (override via $BOTNEK_CONFIG)
npm test                  # vitest run; *.integration.test.ts hits the network (YouTube)
npm run lint[:fix]
npm run prettier[:fix]
npm run build             # tsc --build (noEmit — type-check only)
npm run redeploy          # pm2 restart botnek2 (production)
```

Runtime system deps (not via npm): `ffmpeg`, `ffprobe`, ImageMagick `convert` / `identify`, `file`. All are shelled out via `execSync` / `exec`.

Config is loaded at runtime from `$BOTNEK_CONFIG` (default `~/.botnek2/config.json`), shape in `src/types/config.ts`: `{ token, dataRoot, anthropicApiKey?, logLevel? }`. `dataRoot` is where all persistent guild state and cached audio/emote files live. The Docker image sets `BOTNEK_CONFIG=/config/config.json` and operators bind-mount the file in.

## Architecture at a glance

- `src/index.ts` — entry; logs the voice dependency report and calls `Botnek.login`.
- `src/bot.ts` — constructs the `Client`, wires `clientReady` / `interactionCreate` / `messageCreate`, publishes the command list per guild via REST, and initializes per-guild resources (audio handler + lowdb).
- `src/commands.ts` — the command registry (array of `Command`). Every user-facing feature is exactly one entry here.
- `src/types/command.ts` — the `Command` contract (`data`, `executeCommand`, `executeMessage`, optional `helpText`, `requireUserInChannel`) and the `BotShim` dependency bag threaded through every handler.
- `src/types/guildResource.ts` — trivial `Map<guildId, T>`; used for per-guild `AudioHandler` and `GuildDatabase`.
- `src/audio/` — voice-connection lifecycle, audio queue, and `Track` hierarchy.
- `src/data/` — lowdb wrapper + typed guild schema (sfx, webhooks, emotes).
- `src/commands/emotes/` — gateway abstraction over 7TV / BTTV plus the webhook send path.
- `src/utils/ffmpeg.ts`, `src/utils/imagemagick.ts` — shell-out helpers; cache outputs to deterministic md5-named files so repeated work is free.

Detailed write-ups:

- `docs/architecture.md` — boot sequence, event dispatch, on-disk data layout.
- `docs/commands.md` — one section per registered command.
- `docs/audio.md` — `AudioHandler` state machine, `AudioQueue`, `Track` subclasses, ffmpeg post-fx.
- `docs/emotes.md` — emote ingestion, webhook send, server-emoji upload.
- `docs/data.md` — lowdb schema, `EmoteConfigManager`, dataRoot layout.
- `docs/staleness.md` — known rot, bugs, and suspects worth cleaning up.

## Conventions

- ESM everywhere; imports omit `.ts` (enforced by `import-x/extensions` rule) and JSON imports use `with { type: 'json' }`.
- Prettier: 4-space indent, 100-col, single quotes, trailing commas, semis. `prettier-plugin-organize-imports` sorts imports on format.
- Logging via `src/logging/logging.ts` (pino, level=`trace`). Do not `console.log`.
- Per-guild isolation is load-bearing — never store mutable state at module scope keyed implicitly by the current interaction. Use `BotShim.audioHandlers` / `BotShim.databases` keyed by `guildId`. (The `chatgpt.ts` module is the current violator; see staleness doc.)
- New commands: add a file under `src/commands/`, export a `Command`, register it in `src/commands.ts` **and** in the `cmds` list inside `src/commands/help.ts` (the help embed is its own list — easy to forget).
- Tests: vitest, colocated as `*.test.ts`. Anything that hits the network or a binary lives in `*.integration.test.ts` and is excluded from tsconfig but included in vitest.

## Secrets

The config file (default `~/.botnek2/config.json`) holds the Discord bot token and Anthropic API key in plaintext. It lives outside the repo by default; in dev, restrict its mode to `0600`. Don't print config to logs, don't echo tokens back in replies, and rotate if the file leaves the host.
