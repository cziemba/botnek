# botnek2

[![CI](https://github.com/cziemba/botnek/actions/workflows/ci.yml/badge.svg?branch=mainline)](https://github.com/cziemba/botnek/actions/workflows/ci.yml)

A single-process Node Discord bot (ESM, TypeScript, Node ≥22) built on `discord.js` v14 and `@discordjs/voice`. Provides per-guild sound effects, YouTube playback, 7TV/BTTV emote rendering through channel webhooks, and a Claude (`@anthropic-ai/sdk`) chat passthrough. Commands are exposed both as Discord slash commands and `!`-prefix message commands.

## Install with Docker (recommended)

A pre-built image is published to GHCR on every `v*` tag and bakes in `ffmpeg`, ImageMagick, and `file` — no host install needed. State lives in `~/.botnek2/` so backups are just `tar czf botnek2.tgz ~/.botnek2`.

```sh
mkdir -p ~/.botnek2/data
nano ~/.botnek2/config.json   # paste the example below, set your token

docker run -d \
  --name botnek \
  --restart unless-stopped \
  --user "$(id -u):$(id -g)" \
  -v ~/.botnek2/config.json:/config/config.json:ro \
  -v ~/.botnek2/data:/data \
  --log-driver json-file --log-opt max-size=10m --log-opt max-file=5 \
  ghcr.io/cziemba/botnek:latest
```

That's it — `--restart unless-stopped` brings the bot back on host reboots and crashes. To stop: `docker stop botnek`. To upgrade: `docker pull ghcr.io/cziemba/botnek:latest && docker rm -f botnek` then re-run the command above.

### Viewing logs

The bot emits structured JSON to stdout.

```sh
docker logs -f botnek                  # follow live
docker logs --tail=200 botnek          # last 200 lines
docker logs --since=1h botnek          # last hour
docker logs -f botnek | npx pino-pretty -t   # pretty-print
```

Logs are capped at 5 × 10 MB rolling files (50 MB total) by the `--log-opt` flags above.

### Using compose instead

If you'd rather manage the bot declaratively, the repo ships a [`docker-compose.yml`](docker-compose.yml) that mounts `~/.botnek2/{config.json,data}` regardless of where you put the file. Save it anywhere, write a `.env` alongside it with `PUID=$(id -u)` and `PGID=$(id -g)`, then `docker compose up -d`.

## Configuration

Configuration lives at `~/.botnek2/config.json` by default. Override with the `BOTNEK_CONFIG` env var. Shape:

| field             | type                  | required | description                                                                                       |
| ----------------- | --------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `token`           | `string`              | yes      | Discord bot token.                                                                                |
| `anthropicApiKey` | `string`              | no       | Anthropic API key for the `/claude` command. Omit to disable.                                     |
| `logLevel`        | `pino.LevelWithSilent` | no       | Pino log level (`trace` \| `debug` \| `info` \| `warn` \| `error` \| `fatal` \| `silent`). Defaults to `trace`. Override at runtime with the `LOG_LEVEL` env var. |

Example:

```json
{
    "token": "YOUR_DISCORD_BOT_TOKEN",
    "anthropicApiKey": "sk-ant-...",
    "logLevel": "info"
}
```

The data directory (per-guild lowdb files, audio + emote caches) defaults to `~/.botnek2/data` for native runs and `/data` inside the Docker image (set by `BOTNEK_DATA_ROOT`). Override with the `BOTNEK_DATA_ROOT` env var if you want it elsewhere — e.g. on a separate disk.

Commands are guild-scoped, not global — adding the bot to a new guild requires a process restart so its commands get published there.

## Run from source (development)

Requires Node ≥22 and the following binaries on `$PATH` (shelled out, not pulled via npm):

- `ffmpeg`
- `ffprobe`
- ImageMagick — `convert` and `identify`
- `file`

```sh
npm install
npm test            # vitest run; *.integration.test.ts hits the network (YouTube)
npm start           # ts-node + pino-pretty; data → ~/.botnek2/data
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
