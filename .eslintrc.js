'use strict';

module.exports = {
  env: {
    node: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
  },
  extends: ['eslint:recommended'],
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    curly: ['error', 'all'],
  },
  overrides: [
    {
      files: ['src/public/**/*.js'],
      env: {
        browser: true,
        node: false,
      },
      parserOptions: {
        sourceType: 'module',
      },
      rules: {
        'no-empty': ['error', { allowEmptyCatch: true }],
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      },
    },
  ],
};
