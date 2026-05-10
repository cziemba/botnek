# botnek2 docs

Agentic docs. `CLAUDE.md` at the repo root is the entry point; files here are component-level deep dives.

- [architecture.md](./architecture.md) — boot sequence, event dispatch, per-guild resource model, on-disk layout.
- [commands.md](./commands.md) — every registered command, slash + prefix surface, handler files.
- [audio.md](./audio.md) — `AudioHandler` state machine, queue, `Track` hierarchy, ffmpeg post-fx.
- [emotes.md](./emotes.md) — gateway abstraction, 7TV / BTTV ingestion, webhook send path, server-emoji upload.
- [data.md](./data.md) — lowdb schema, `EmoteConfigManager`, dataRoot layout, branded-string aliases.
- [staleness.md](./staleness.md) — known bugs, dependency rot, and cleanup starting points.
