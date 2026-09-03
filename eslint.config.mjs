import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * Flat config. `eslint-config-next` v16 ships flat configs directly, so no
 * compatibility shim is needed.
 */
const config = [
  {
    // `public/` is served as-is: downloaded engine builds, generated benchmark
    // fixtures, and anything else copied there to be fetched by the app. None
    // of it is source, and linting it fails builds for reasons nobody authored.
    /*
      `test-results/` and `playwright-report/` hold Playwright's own trace
      artifacts — bundled third-party JavaScript that trips a dozen rules and
      is not ours to fix. They are gitignored, so CI never sees them, but a
      developer who has run the browser suite locally was getting twenty-one
      lint errors from a directory they did not write.
    */
    ignores: [
      '.next/**',
      'node_modules/**',
      'public/**',
      'next-env.d.ts',
      'scripts/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // `const { dropped: _dropped, ...rest }` is how a key is removed from an
      // immutable object; the binding is deliberately unused.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
    },
  },
];

export default config;
