import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        include: ['src/**/*.{test,spec}.ts'],
        exclude: ['node_modules', 'dist'],
        coverage: {
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'test/**/*',
                '**/*.d.ts',
                '**/*.test.ts',
                '**/*.integration.test.ts',
            ],
        },
    },
});
