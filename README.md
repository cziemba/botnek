# botnek2

[![CI](https://github.com/cziemba/botnek/actions/workflows/ci.yml/badge.svg?branch=mainline)](https://github.com/cziemba/botnek/actions/workflows/ci.yml)

A single-process Node Discord bot (ESM, TypeScript, Node ≥22) built on `discord.js` v14 and `@discordjs/voice`. Provides per-guild sound effects, YouTube playback, 7TV/BTTV emote rendering through channel webhooks, and a Claude (`@anthropic-ai/sdk`) chat passthrough. Commands are exposed both as Discord slash commands and `!`-prefix message commands.

## Configuration

Configuration lives at `~/.config/botnek2/config.json` by default. Override with the `BOTNEK_CONFIG` env var. Shape:

| field             | type                  | required | description                                                                                       |
| ----------------- | --------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `token`           | `string`              | yes      | Discord bot token.                                                                                |
| `dataRoot`        | `string`              | yes      | Filesystem path used for all persistent guild state and cached audio/emote files.                 |
| `anthropicApiKey` | `string`              | no       | Anthropic API key for the `/claude` command. Omit to disable.                                     |
| `logLevel`        | `pino.LevelWithSilent` | no       | Pino log level (`trace` \| `debug` \| `info` \| `warn` \| `error` \| `fatal` \| `silent`). Defaults to `trace`. Override at runtime with the `LOG_LEVEL` env var. |

Example:

```json
{
    "token": "YOUR_DISCORD_BOT_TOKEN",
    "dataRoot": "/data",
    "anthropicApiKey": "sk-ant-...",
    "logLevel": "info"
}
```

`dataRoot` must be writable — the bot creates per-guild subdirectories aggressively (audio cache, emote cache, lowdb files). Commands are guild-scoped, not global, so adding the bot to a new guild requires a process restart so its commands get published there.

## Run with Docker (recommended)

A pre-built image is published to GHCR on every `v*` tag and bakes in `ffmpeg`, ImageMagick, and `file` — no host install needed.

```sh
docker pull ghcr.io/cziemba/botnek:latest
```

Minimal compose setup (see [`docker-compose.yml`](docker-compose.yml)):

```yaml
services:
  botnek:
    image: ghcr.io/cziemba/botnek:latest
    restart: unless-stopped
    volumes:
      - ./config.json:/config/config.json:ro
      - ./data:/data
```

With `"dataRoot": "/data"` in your `config.json`, all persistent state lands on the mounted volume.

```sh
docker compose up -d
```

## Run from source (development)

Requires Node ≥22 and the following binaries on `$PATH` (shelled out, not pulled via npm):

- `ffmpeg`
- `ffprobe`
- ImageMagick — `convert` and `identify`
- `file`

```sh
npm install
npm test            # vitest run; *.integration.test.ts hits the network (YouTube)
npm start           # ts-node + pino-pretty
```

Other useful scripts:

```sh
npm run build              # tsc --build (type-check, no emit)
npm run lint[:fix]
npm run prettier[:fix]
npm run redeploy           # pm2 restart botnek2 (production)
```

## Releasing

Bump `version` in `package.json`, tag, push:

```sh
git tag v1.2.3
git push origin v1.2.3
```

The release workflow builds the image and publishes `ghcr.io/cziemba/botnek:1.2.3`, `:1.2`, and `:latest`.

## Documentation

Detailed write-ups live in `docs/`:

- [`docs/architecture.md`](docs/architecture.md) — boot sequence, event dispatch, on-disk data layout
- [`docs/commands.md`](docs/commands.md) — one section per registered command
- [`docs/audio.md`](docs/audio.md) — `AudioHandler` state machine, `AudioQueue`, `Track` subclasses, ffmpeg post-fx
- [`docs/emotes.md`](docs/emotes.md) — emote ingestion, webhook send, server-emoji upload
- [`docs/data.md`](docs/data.md) — lowdb schema, `EmoteConfigManager`, dataRoot layout
- [`docs/staleness.md`](docs/staleness.md) — known rot, bugs, suspects worth cleaning up
- [`docs/roadmap.md`](docs/roadmap.md) — forward-looking work
