// SevenTVEmoteGateway adapts the 7TV v3 REST API (https://7tv.io/v3) to EmoteGateway. The previous
// implementation used the now-EOL v2 endpoint (api.7tv.app/v2) which returned a flat `urls` table;
// v3 instead returns a `host.files[]` array with format/dimension metadata, so format-and-size
// selection is explicit (`pickBestSourceFile`) rather than picking the last entry of an array.
// Cached on-disk file names still use the 7TV emote ID — the v2 and v3 ID schemes are identical
// (24-char hex), so caches written by the old gateway continue to resolve transparently.
import fs from 'fs';
import nodeFetch from 'node-fetch';
import path from 'path';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { Emote, EmoteSource } from '../../data/types/emote';
import log from '../../logging/logging';
import { BotnekConfig } from '../../types/config';
import { convertToGif, extractFrameDelay } from '../../utils/imagemagick';
import EmoteGateway from './emoteGateway';

const API_BASE = 'https://7tv.io/v3';
// `/emotes/<id>` and `/emote/<id>` are both used in the wild (7TV's own UI links to the plural
// form, but old shares from third-party sites use the singular). Tolerate both.
const URL_ID_MATCHER = /https?:\/\/(?:www\.)?7tv\.app\/emote(?:s)?\/(?<id>[A-Za-z0-9]+)/;
const streamPipeline = promisify(pipeline);

// 7TV v3 hosts each emote in multiple formats. For animated emotes we prefer GIF source so
// ImageMagick's `-coalesce` + `-delay` re-timing path stays on a well-trodden codec; WEBP frames
// have inconsistent disposal handling in our installed ImageMagick build, and falling back to PNG
// for an animated emote loses motion entirely (so PNG is last). For static emotes we flip the
// preference: PNG decodes everywhere, WEBP is fine, and a single-frame GIF is the worst option
// (palette quantization on a high-color sprite). The final coerce-to-GIF step still happens
// regardless because Discord's webhook send path is uniform on `.gif`.
const ANIMATED_FORMAT_PREFERENCE = ['GIF', 'WEBP', 'PNG'] as const;
const STATIC_FORMAT_PREFERENCE = ['PNG', 'WEBP', 'GIF'] as const;

export interface SevenTVHostFile {
    name: string;
    static_name?: string;
    width: number;
    height: number;
    frame_count: number;
    size: number;
    format: string;
}

export interface SevenTVEmoteData {
    id: string;
    name: string;
    animated: boolean;
    host: {
        url: string;
        files: SevenTVHostFile[];
    };
}

// Narrowed `fetch` shape — kept here (rather than typing against `node-fetch`'s Response directly)
// so unit tests can inject a mock without pulling node-fetch's full type surface into test files.
export type Fetcher = (url: string) => Promise<{
    ok: boolean;
    status?: number;
    statusText?: string;
    url?: string;
    json: () => Promise<unknown>;
    body: NodeJS.ReadableStream | null;
}>;

const defaultFetcher: Fetcher = nodeFetch as unknown as Fetcher;

export function pickBestSourceFile(data: SevenTVEmoteData): SevenTVHostFile | undefined {
    const preference = data.animated ? ANIMATED_FORMAT_PREFERENCE : STATIC_FORMAT_PREFERENCE;
    for (const fmt of preference) {
        const candidates = data.host.files.filter((f) => f.format === fmt);
        if (candidates.length === 0) continue;
        // Within a format pick the largest width — 7TV typically serves 1x/2x/3x/4x and we always
        // want the highest source resolution because the downstream `convertToGif` resize is
        // height-capped at 112px (Discord webhook attachments don't enforce an upper bound, but
        // we match server-emoji sizing for visual parity between the two surfaces).
        return candidates.reduce((best, f) => (f.width > best.width ? f : best));
    }
    return data.host.files[data.host.files.length - 1];
}

export function buildCdnUrl(host: { url: string }, file: SevenTVHostFile): string {
    // 7TV's API returns `host.url` as protocol-relative (`//cdn.7tv.app/emote/<id>`). We always
    // run over HTTPS — some Node fetch implementations refuse protocol-relative URLs outright.
    const base = host.url.startsWith('//') ? `https:${host.url}` : host.url;
    return `${base}/${file.name}`;
}

export function toEmote(data: SevenTVEmoteData): Emote {
    return {
        id: data.id,
        // `defaultAlias` is the upstream display name as of fetch time. We snapshot it here rather
        // than lazily resolving so a 7TV-side rename doesn't silently change what `/emote list`
        // shows in a guild that already aliased the emote under a different name.
        defaultAlias: data.name,
        source: EmoteSource.SEVENTV,
    };
}

export default class SevenTVEmoteGateway extends EmoteGateway {
    private readonly fetcher: Fetcher;

    public constructor(botnekConfig: BotnekConfig, fetcher: Fetcher = defaultFetcher) {
        super(botnekConfig);
        this.fetcher = fetcher;
    }

    public async fetchEmote(id: string): Promise<Emote> {
        const data = await this.emoteApi(id);
        const emote = toEmote(data);
        const gifPath = path.join(this.emoteRootPath, `${emote.id}.gif`);
        // Existence check is the cache hit: if the converted gif is on disk we skip the download
        // AND skip the convert step. Note this directory has no GC — orphaned files from emotes
        // removed in every guild stay forever.
        if (fs.existsSync(gifPath)) return emote;

        const file = pickBestSourceFile(data);
        if (!file) throw new Error(`No source files for 7TV emote ${id}`);
        // Preserve the source extension on the staging file so ImageMagick's auto-detection picks
        // the right decoder; e.g. a `.webp` file masquerading as `.bin` decodes incorrectly.
        const ext = file.name.split('.').pop() ?? 'bin';
        const dlPath = path.join(this.emoteRootPath, `${emote.id}-tmp.${ext}`);
        const sourceUrl = buildCdnUrl(data.host, file);

        log.debug(`Caching emote https://7tv.app/emotes/${emote.id} -> ${dlPath} -> ${gifPath}`);
        const resp = await this.fetcher(sourceUrl);
        if (!resp.ok || !resp.body) {
            throw new Error(`Error fetching ${sourceUrl}: ${resp.statusText ?? resp.status}`);
        }
        await streamPipeline(resp.body, fs.createWriteStream(dlPath));

        // `extractFrameDelay` throws on single-frame inputs (no `Delay:` line in `identify`
        // output); treat that as "this is a static emote, encode at delay=0" rather than failing
        // the whole import. PNG static emotes hit this path constantly.
        let delay = 0;
        try {
            delay = await extractFrameDelay(dlPath);
        } catch (e) {
            log.warn(`${e}: assuming static image`);
        }
        await convertToGif(dlPath, gifPath, delay);
        return emote;
    }

    public tryParseUrl(url: string): string | undefined {
        const idMatch = url.match(URL_ID_MATCHER);
        return idMatch?.groups?.id;
    }

    private async emoteApi(id: string): Promise<SevenTVEmoteData> {
        const resp = await this.fetcher(`${API_BASE}/emotes/${id}`);
        if (!resp.ok) throw new Error(resp.statusText ?? `status ${resp.status}`);
        return (await resp.json()) as SevenTVEmoteData;
    }
}
