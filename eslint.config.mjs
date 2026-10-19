import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

// Node globals for the scripts/ tooling and the config files themselves. The
// `globals` package is not a declared dependency, so the used names are listed.
const nodeGlobals = {
  process: 'readonly',
  console: 'readonly',
  URL: 'readonly',
  Buffer: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
};

// Service worker globals (lib.webworker) used by public/sw.js.
const serviceWorkerGlobals = {
  self: 'readonly',
  caches: 'readonly',
  fetch: 'readonly',
  URL: 'readonly',
};

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      '.ai-sources/**',
      'playwright-report/**',
      'test-results/**',
      'coverage/**',
      'next-env.d.ts',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  // `configs['recommended-latest']` is the legacy (array plugins) shape; the
  // flat-config preset lives under `configs.flat`.
  reactHooks.configs.flat['recommended-latest'],
  {
    files: ['**/*.mjs'],
    languageOptions: { globals: nodeGlobals },
  },
  {
    files: ['public/sw.js'],
    languageOptions: { globals: serviceWorkerGlobals },
  },
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
);
