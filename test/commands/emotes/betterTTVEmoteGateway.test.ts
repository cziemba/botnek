import fs from 'fs';
import fetch from 'node-fetch';
import { EmoteSource } from '../../../data/types/emote';
import { BotnekConfig } from '../../../types/config';
import BetterTTVEmoteGateway from '../betterTTVEmoteGateway';

jest.mock('node-fetch');
jest.mock('fs');

describe('BetterTTVEmoteGateway', () => {
    let gateway: BetterTTVEmoteGateway;
    const mockConfig: BotnekConfig = {
        emoteRootPath: '/mock/path',
    } as BotnekConfig;

    beforeEach(() => {
        gateway = new BetterTTVEmoteGateway(mockConfig);
        jest.clearAllMocks();
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
        const mockEmoteData = {
            id: '5e76d338d6581c3724c0f0b2',
            code: 'catJAM',
            imageType: 'gif',
        };

        const mockResponse = {
            ok: true,
            json: jest.fn().mockResolvedValue(mockEmoteData),
        };
        (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse as any);

        (fs.existsSync as jest.MockedFunction<typeof fs.existsSync>).mockReturnValue(false);

        const emote = await gateway.fetchEmote('5e76d338d6581c3724c0f0b2');

        expect(emote).toEqual({
            id: '5e76d338d6581c3724c0f0b2',
            defaultAlias: 'catJAM',
            source: EmoteSource.BTTV,
        });

        expect(fetch).toHaveBeenCalledWith(
            'https://api.betterttv.net/3/emotes/5e76d338d6581c3724c0f0b2',
        );
    });

    it('should throw error for invalid emote ID', async () => {
        const mockResponse = {
            ok: false,
            statusText: 'Not Found',
        };
        (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse as any);

        await expect(gateway.fetchEmote('invalid_id')).rejects.toThrow('Not Found');
    });
});
