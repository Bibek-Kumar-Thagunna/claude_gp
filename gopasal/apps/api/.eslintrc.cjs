/**
 * Lint rules for the GoPasal API.
 *
 * Type-aware: the parser is pointed at tsconfig.json so rules can reason about
 * real types rather than syntax alone. That is what makes the two rules below
 * meaningful — they are the ones that catch the mistakes that actually hurt in a
 * NestJS + Prisma codebase.
 *
 *   no-explicit-any            — the deal is that types stay honest. If a shape
 *                                is genuinely unknown, say `unknown` and narrow.
 *   no-floating-promises       — an un-awaited Prisma call or emitted event fails
 *                                silently in production. This makes it a build error.
 *
 * Decorator-heavy Nest classes trip a handful of stylistic defaults that carry no
 * information, so those are switched off rather than worked around at every site.
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['./tsconfig.json'],
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
  ],
  env: { node: true, es2022: true },
  ignorePatterns: ['dist/', 'node_modules/', '.eslintrc.cjs'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],

    // Nest resolves constructor params by decorator metadata; an empty
    // interface is a legitimate marker type in a DTO hierarchy.
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-empty-interface': 'off',
  },
  overrides: [
    {
      // `node:test` builds its tree by *calling* describe/it, and each call
      // returns a promise the runner itself awaits — a floating promise here is
      // the documented API, not a dropped Prisma call. The rule stays on
      // everywhere else, and nothing else is relaxed for specs.
      files: ['**/*.spec.ts'],
      rules: { '@typescript-eslint/no-floating-promises': 'off' },
    },
  ],
};
