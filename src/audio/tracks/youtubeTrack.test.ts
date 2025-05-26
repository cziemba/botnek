import ytdl from '@distube/ytdl-core';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import YoutubeTrack from './youtubeTrack';

describe('YoutubeTrack', () => {
    const mockAudioStoragePath = '/tmp/test-audio';
    const mockYoutubeUrl = 'https://www.youtube.com/watch?v=oxZxe092eqo';
    const mockTitle = 'test video title';
    let track: YoutubeTrack;

    beforeEach(() => {
        // Create a test directory
        if (fs.existsSync(mockAudioStoragePath)) {
            fs.rmSync(mockAudioStoragePath, { recursive: true });
        }
        fs.mkdirSync(mockAudioStoragePath, { recursive: true });

        // Mock ytdl
        vi.mock('@distube/ytdl-core', () => ({
            default: vi.fn(),
            validateURL: vi.fn().mockReturnValue(true),
            getBasicInfo: vi.fn().mockResolvedValue({
                videoDetails: {
                    title: 'test video title',
                },
            }),
        }));

        // Create a test track instance
        track = new YoutubeTrack(mockYoutubeUrl, { title: mockTitle } as any);
    });

    afterEach(() => {
        // Clean up test files and mocks
        if (fs.existsSync(mockAudioStoragePath)) {
            fs.rmSync(mockAudioStoragePath, { recursive: true });
        }
        vi.clearAllMocks();
    });

    it('should download and save audio file with data', async () => {
        const mockAudioData = randomBytes(1000);
        ytdl.mockReturnValueOnce(Readable.from(mockAudioData));
        // Execute the save
        const outputPath = await track.saveAudio(mockAudioStoragePath);

        // Verify a file exists and has content
        expect(fs.existsSync(outputPath)).toBe(true);
        const fileStats = fs.statSync(outputPath);
        expect(fileStats.size).toBeGreaterThan(0);

        // Verify file content matches our mock data
        const savedData = fs.readFileSync(outputPath, 'binary');
        expect(savedData).toEqual(mockAudioData.toString('binary'));
    });

    it('should not download if file already exists', async () => {
        // Create a pre-existing file
        const expectedPath = `${mockAudioStoragePath}/${mockTitle.toLowerCase().replaceAll(/[^a-z0-9]/g, '')}.mp3`;
        const mockContent = 'existing content';
        fs.writeFileSync(expectedPath, mockContent);

        // Execute the save
        const outputPath = await track.saveAudio(mockAudioStoragePath);

        // Verify ytdl was not called
        expect(ytdl).not.toHaveBeenCalled();

        // Verify the existing file was not modified
        const fileContent = fs.readFileSync(outputPath, 'utf-8');
        expect(fileContent).toBe(mockContent);
    });
});
