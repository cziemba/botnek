import fs from 'fs';
import fetch from 'node-fetch';
import { createWriteStream } from 'node:fs';
import { PassThrough, Readable } from 'node:stream';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import BetterTTVEmoteGateway from '../../../src/commands/emotes/betterTTVEmoteGateway';
import { EmoteSource } from '../../../src/data/types/emote';
import { BotnekConfig } from '../../../src/types/config';

vi.mock('fs');

vi.mock('../../../src/utils/imagemagick', () => {
    return {
        convertToGif: vi.fn(),
        extractFrameDelay: vi.fn().mockResolvedValue(20),
    };
});

vi.mock('node-fetch', () => {
    return {
        default: vi.fn(),
    };
});

describe('BetterTTVEmoteGateway', () => {
    let gateway: BetterTTVEmoteGateway;
    const mockConfig: BotnekConfig = {
        token: 'test',
        dataRoot: '/mock/path',
    };

    beforeEach(() => {
        gateway = new BetterTTVEmoteGateway(mockConfig);
    });

    it('should parse BTTV URL correctly', () => {
        const url = 'https://betterttv.com/emotes/5e76d338d6581c3724c0f0b2';
        const result = gateway.tryParseUrl(url);
        expect(result).toBe('5e76d338d6581c3724c0f0b2');
    });

    it('should return undefined for non-BTTV URL', () => {
        const url = 'https://example.com/emote/123';
        const result = gateway.tryParseUrl(url);
        expect(result).toBeUndefined();
    });

    it('should fetch emote data correctly', async () => {
        // @ts-ignore
        const mockEmoteData = {
            id: '5e76d338d6581c3724c0f0b2',
            code: 'catJAM',
            imageType: 'gif',
        };

        (fetch as Mock<typeof fetch>)
            .mockResolvedValueOnce({
                json: vi.fn().mockResolvedValue(mockEmoteData as any),
                ok: true,
            } as any)
            .mockResolvedValueOnce({
                body: Readable.from(['test-emote-data-from-cdn']),
                ok: true,
            } as any);

        (fs.existsSync as Mock<typeof fs.existsSync>).mockReturnValue(false);

        const writable = new PassThrough();
        const writeSpy = vi.spyOn(writable, 'write');
        vi.mocked(createWriteStream).mockReturnValueOnce(writable);

        const emote = await gateway.fetchEmote('5e76d338d6581c3724c0f0b2');

        expect(emote).toEqual({
            id: '5e76d338d6581c3724c0f0b2',
            defaultAlias: 'catJAM',
            source: EmoteSource.BTTV,
        });

        expect(fetch).toHaveBeenCalledWith(
            'https://api.betterttv.net/3/emotes/5e76d338d6581c3724c0f0b2',
        );
        expect(fetch).toHaveBeenCalledWith(
            'https://cdn.betterttv.net/emote/5e76d338d6581c3724c0f0b2/3x',
        );

        expect(writeSpy).toHaveBeenCalledWith('test-emote-data-from-cdn');
    });

    it('should throw error for invalid emote ID', async () => {
        (fetch as Mock<typeof fetch>).mockResolvedValueOnce({
            ok: false,
            statusText: 'Not Found',
        } as any);
        await expect(gateway.fetchEmote('invalid_id')).rejects.toThrow('Not Found');
    });
});
