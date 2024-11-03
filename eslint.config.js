import stylistic from '@stylistic/eslint-plugin';
import stylisticJs from '@stylistic/eslint-plugin-js';
import stylisticTs from '@stylistic/eslint-plugin-ts';
import typescriptParser from '@typescript-eslint/parser';
import prettierRecommended from 'eslint-config-prettier';
import eslintPluginImportX from 'eslint-plugin-import-x';
import prettier from 'prettier';

export default [
    prettierRecommended,
    eslintPluginImportX.flatConfigs.recommended,
    eslintPluginImportX.flatConfigs.typescript,
    {
        languageOptions: {
            parser: typescriptParser,
            ecmaVersion: 'latest',
            sourceType: 'module',
        },
        files: ['src/**/*.ts', 'test/**/*.ts'],
        plugins: {
            prettier: prettier,
            '@stylistic/ts': stylisticTs,
            '@stylistic/js': stylisticJs,
            '@stylistic': stylistic,
        },
        rules: {
            '@stylistic/object-curly-spacing': ['error', 'always'],
            '@stylistic/indent': ['error', 4],
            '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
            'import-x/extensions': ['error', 'never', { json: 'always' }],
        },
    },
];
