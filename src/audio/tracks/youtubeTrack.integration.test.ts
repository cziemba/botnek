import fs from 'fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ffmpegDurationSeconds } from '../../utils/ffmpeg';
import YoutubeTrack from './youtubeTrack';

describe('YoutubeTrack Integration Tests', () => {
    const testDir = '/tmp/test-audio';
    beforeEach(() => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true });
        }
        fs.mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true });
        }
    });

    it('should download actual audio file from YouTube', async () => {
        // Using a short, copyright-free video for testing
        const url = 'https://www.youtube.com/watch?v=oxZxe092eqo';

        const track = await YoutubeTrack.fromUrl(url);
        const outputPath = await track.saveAudio(testDir);

        // Verify file exists
        expect(fs.existsSync(outputPath)).toBe(true);

        // Verify file has actual audio data
        const fileStats = fs.statSync(outputPath);
        expect(fileStats.size).toBeGreaterThan(10000); // Should be at least 10K

        // Verify it's a valid audio file by checking its duration
        const duration = ffmpegDurationSeconds(outputPath);
        expect(duration).toBe('17.693605\n');
    }, 30000);
});
