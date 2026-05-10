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
const URL_ID_MATCHER = /https?:\/\/(?:www\.)?7tv\.app\/emote(?:s)?\/(?<id>[A-Za-z0-9]+)/;
const streamPipeline = promisify(pipeline);

// Format preference for animated vs static. v3 advertises GIF/WEBP/AVIF/PNG; we want largest GIF
// for animated (so ImageMagick can re-time it) and largest PNG for static (broadest decode support).
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
        return candidates.reduce((best, f) => (f.width > best.width ? f : best));
    }
    return data.host.files[data.host.files.length - 1];
}

export function buildCdnUrl(host: { url: string }, file: SevenTVHostFile): string {
    // host.url comes back protocol-relative ("//cdn.7tv.app/emote/<id>"); upgrade to https.
    const base = host.url.startsWith('//') ? `https:${host.url}` : host.url;
    return `${base}/${file.name}`;
}

export function toEmote(data: SevenTVEmoteData): Emote {
    return {
        id: data.id,
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
        if (fs.existsSync(gifPath)) return emote;

        const file = pickBestSourceFile(data);
        if (!file) throw new Error(`No source files for 7TV emote ${id}`);
        const ext = file.name.split('.').pop() ?? 'bin';
        const dlPath = path.join(this.emoteRootPath, `${emote.id}-tmp.${ext}`);
        const sourceUrl = buildCdnUrl(data.host, file);

        log.debug(`Caching emote https://7tv.app/emotes/${emote.id} -> ${dlPath} -> ${gifPath}`);
        const resp = await this.fetcher(sourceUrl);
        if (!resp.ok || !resp.body) {
            throw new Error(`Error fetching ${sourceUrl}: ${resp.statusText ?? resp.status}`);
        }
        await streamPipeline(resp.body, fs.createWriteStream(dlPath));

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
