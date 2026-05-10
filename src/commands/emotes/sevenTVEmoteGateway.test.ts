import fs from 'fs';
import { createWriteStream } from 'node:fs';
import { PassThrough, Readable } from 'node:stream';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { EmoteSource } from '../../data/types/emote';
import { BotnekConfig } from '../../types/config';
import SevenTVEmoteGateway, {
    buildCdnUrl,
    Fetcher,
    pickBestSourceFile,
    SevenTVEmoteData,
    toEmote,
} from './sevenTVEmoteGateway';

vi.mock('fs');

vi.mock('../../../src/utils/imagemagick', () => ({
    convertToGif: vi.fn(),
    extractFrameDelay: vi.fn().mockResolvedValue(20),
}));

const mockConfig: BotnekConfig = { token: 'test', dataRoot: '/mock/path' };

const animatedFixture: SevenTVEmoteData = {
    id: '01F6MKTFTG0009C9ZSNZTFV2ZF',
    name: 'NOOOO',
    animated: true,
    host: {
        url: '//cdn.7tv.app/emote/01F6MKTFTG0009C9ZSNZTFV2ZF',
        files: [
            { name: '1x.webp', width: 34, height: 32, frame_count: 6, size: 1, format: 'WEBP' },
            { name: '4x.webp', width: 136, height: 128, frame_count: 6, size: 4, format: 'WEBP' },
            { name: '1x.gif', width: 34, height: 32, frame_count: 6, size: 4429, format: 'GIF' },
            { name: '2x.gif', width: 68, height: 64, frame_count: 6, size: 12438, format: 'GIF' },
            { name: '4x.gif', width: 136, height: 128, frame_count: 6, size: 36198, format: 'GIF' },
        ],
    },
};

const staticFixture: SevenTVEmoteData = {
    id: '01F6MXJD8R000F76KNAAV5HDGD',
    name: 'Bedge',
    animated: false,
    host: {
        url: '//cdn.7tv.app/emote/01F6MXJD8R000F76KNAAV5HDGD',
        files: [
            { name: '1x.webp', width: 32, height: 32, frame_count: 1, size: 938, format: 'WEBP' },
            {
                name: '4x.webp',
                width: 128,
                height: 128,
                frame_count: 1,
                size: 4476,
                format: 'WEBP',
            },
            { name: '1x.png', width: 32, height: 32, frame_count: 1, size: 2730, format: 'PNG' },
            { name: '4x.png', width: 128, height: 128, frame_count: 1, size: 27444, format: 'PNG' },
        ],
    },
};

describe('SevenTVEmoteGateway URL parser', () => {
    const gateway = new SevenTVEmoteGateway(mockConfig, vi.fn() as unknown as Fetcher);
    const cases: { url: string; expected: string | undefined }[] = [
        {
            url: 'https://7tv.app/emotes/01F6MXJD8R000F76KNAAV5HDGD',
            expected: '01F6MXJD8R000F76KNAAV5HDGD',
        },
        {
            url: 'https://7tv.app/emote/01F6MXJD8R000F76KNAAV5HDGD',
            expected: '01F6MXJD8R000F76KNAAV5HDGD',
        },
        {
            url: 'http://7tv.app/emotes/abc123',
            expected: 'abc123',
        },
        {
            url: 'https://www.7tv.app/emotes/01F6MKTFTG0009C9ZSNZTFV2ZF',
            expected: '01F6MKTFTG0009C9ZSNZTFV2ZF',
        },
        {
            url: 'https://7tv.app/emotes/01F6MXJD8R000F76KNAAV5HDGD?tab=info',
            expected: '01F6MXJD8R000F76KNAAV5HDGD',
        },
        { url: 'https://example.com/emotes/abc', expected: undefined },
        { url: 'https://7tv.app/users/foo', expected: undefined },
        { url: 'not a url', expected: undefined },
    ];
    it.each(cases)('parses %j', ({ url, expected }) => {
        expect(gateway.tryParseUrl(url)).toBe(expected);
    });
});

describe('SevenTVEmoteGateway helpers', () => {
    it('picks largest GIF for animated emotes', () => {
        const file = pickBestSourceFile(animatedFixture);
        expect(file?.name).toBe('4x.gif');
    });

    it('picks largest PNG for static emotes', () => {
        const file = pickBestSourceFile(staticFixture);
        expect(file?.name).toBe('4x.png');
    });

    it('falls back to next preferred format when GIF missing', () => {
        const noGif: SevenTVEmoteData = {
            ...animatedFixture,
            host: {
                ...animatedFixture.host,
                files: animatedFixture.host.files.filter((f) => f.format !== 'GIF'),
            },
        };
        const file = pickBestSourceFile(noGif);
        expect(file?.name).toBe('4x.webp');
    });

    it('builds an https CDN url from the protocol-relative host', () => {
        const file = pickBestSourceFile(animatedFixture)!;
        expect(buildCdnUrl(animatedFixture.host, file)).toBe(
            'https://cdn.7tv.app/emote/01F6MKTFTG0009C9ZSNZTFV2ZF/4x.gif',
        );
    });

    it('maps response shape to Emote', () => {
        expect(toEmote(animatedFixture)).toEqual({
            id: '01F6MKTFTG0009C9ZSNZTFV2ZF',
            defaultAlias: 'NOOOO',
            source: EmoteSource.SEVENTV,
        });
    });
});

describe('SevenTVEmoteGateway fetchEmote', () => {
    let fetcher: Mock;
    let gateway: SevenTVEmoteGateway;

    beforeEach(() => {
        vi.clearAllMocks();
        fetcher = vi.fn();
        gateway = new SevenTVEmoteGateway(mockConfig, fetcher as unknown as Fetcher);
    });

    it('returns mapped emote without re-downloading when cached', async () => {
        fetcher.mockResolvedValueOnce({
            ok: true,
            json: async () => animatedFixture,
            body: null,
        });
        (fs.existsSync as Mock<typeof fs.existsSync>).mockReturnValue(true);

        const emote = await gateway.fetchEmote('01F6MKTFTG0009C9ZSNZTFV2ZF');

        expect(emote).toEqual({
            id: '01F6MKTFTG0009C9ZSNZTFV2ZF',
            defaultAlias: 'NOOOO',
            source: EmoteSource.SEVENTV,
        });
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(fetcher).toHaveBeenCalledWith('https://7tv.io/v3/emotes/01F6MKTFTG0009C9ZSNZTFV2ZF');
    });

    it('downloads the largest GIF for an animated emote', async () => {
        fetcher
            .mockResolvedValueOnce({
                ok: true,
                json: async () => animatedFixture,
                body: null,
            })
            .mockResolvedValueOnce({
                ok: true,
                body: Readable.from(['gif-bytes']),
            });
        (fs.existsSync as Mock<typeof fs.existsSync>).mockReturnValue(false);
        const writable = new PassThrough();
        const writeSpy = vi.spyOn(writable, 'write');
        vi.mocked(createWriteStream).mockReturnValueOnce(writable);

        const emote = await gateway.fetchEmote('01F6MKTFTG0009C9ZSNZTFV2ZF');

        expect(emote.source).toBe(EmoteSource.SEVENTV);
        expect(fetcher).toHaveBeenNthCalledWith(
            2,
            'https://cdn.7tv.app/emote/01F6MKTFTG0009C9ZSNZTFV2ZF/4x.gif',
        );
        expect(writeSpy).toHaveBeenCalledWith('gif-bytes');
    });

    it('throws on a non-ok metadata response', async () => {
        fetcher.mockResolvedValueOnce({
            ok: false,
            statusText: 'Not Found',
            json: async () => ({}),
            body: null,
        });
        await expect(gateway.fetchEmote('nope')).rejects.toThrow('Not Found');
    });
});
