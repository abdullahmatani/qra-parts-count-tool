import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dev-dist',
      'release',
      'coverage',
      'test-results',
      'playwright-report',
      '.wrangler',
      'docs',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The app does not use the React Compiler, so libraries such as TanStack Table
      // and Virtual that it cannot optimise are fine.
      'react-hooks/incompatible-library': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      // No network access at runtime (FDS section 2). Forbid the obvious ways of making one.
      'no-restricted-globals': [
        'error',
        { name: 'XMLHttpRequest', message: 'The app must not make network requests (FDS §2).' },
        { name: 'WebSocket', message: 'The app must not make network requests (FDS §2).' },
        { name: 'EventSource', message: 'The app must not make network requests (FDS §2).' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'navigator',
          property: 'sendBeacon',
          message: 'The app must not send telemetry (FDS §2).',
        },
      ],
    },
  },
  {
    // shadcn/ui components export variants alongside components by design.
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**/*.{ts,tsx}'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    files: ['scripts/**/*.{ts,mjs,js}', '*.config.{ts,js}', 'e2e/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    // Playwright fixtures call a `use` function that is not a React hook.
    rules: { 'no-restricted-globals': 'off', 'react-hooks/rules-of-hooks': 'off' },
  },
  prettier,
);
