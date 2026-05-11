// Base class for the per-source emote ingestion pipelines (7TV, BTTV). Concrete subclasses parse
// source URLs into stable IDs and download metadata + media into a shared on-disk cache rooted at
// `${dataRoot}/emotes/`. Every cached file is normalized to `<sourceId>.gif` regardless of upstream
// format so the webhook send path (and Discord's animated-emoji upload path) can stay format-agnostic.
//
// Cache invariants worth knowing:
//  - The directory is shared across guilds and across sources; an emote downloaded for guild A is
//    served to guild B without re-fetching. This is intentional (saves disk + API quota) but means
//    the cache has no concept of refcounts, and `/emote remove` does NOT delete files. Orphans
//    accumulate forever until something sweeps `${dataRoot}/emotes/` — see `convertToGif` callers
//    below; a future GC pass would key off the union of `EmoteConfigManager.listEmotes()` across
//    every guild db.
//  - 7TV and BTTV use disjoint ID spaces in practice (7TV is a 24-char ObjectID hex, BTTV is also
//    24 hex); a collision would silently serve the wrong gif. No defensive prefixing today because
//    the risk has never materialized, but it's worth knowing if you ever change ID scheme.
import fs from 'fs';
import path from 'path';
import { Emote } from '../../data/types/emote';
import { BotnekConfig } from '../../types/config';

export default abstract class EmoteGateway {
    public static readonly EMOTE_DIR = 'emotes';

    protected readonly emoteRootPath: string;

    // Idempotent: returns the existing Emote record if `<id>.gif` is already cached, otherwise
    // downloads + transcodes. The returned `Emote.id` is the source-platform ID (NOT the alias);
    // alias mapping lives in EmoteConfigManager so the same cached file can back many aliases.
    public abstract fetchEmote(id: string): Promise<Emote>;

    // Returns the source-specific emote ID parsed from a 7TV/BTTV URL, or undefined if this
    // gateway doesn't recognize the URL. Callers try every gateway and use whichever responds —
    // there's no central URL router because the per-source URL formats are too divergent to share
    // a single regex without making each gateway harder to reason about in isolation.
    public abstract tryParseUrl(url: string): string | undefined;

    protected constructor(botnekConfig: BotnekConfig) {
        this.emoteRootPath = path.resolve(path.join(botnekConfig.dataRoot, EmoteGateway.EMOTE_DIR));
        if (!fs.existsSync(this.emoteRootPath))
            fs.mkdirSync(this.emoteRootPath, { recursive: true });
    }
}
