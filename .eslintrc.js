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
  },
  overrides: [
    {
      files: ['src/public/**/*.js'],
      env: {
        browser: true,
        node: false,
      },
      rules: {
        'no-empty': ['error', { allowEmptyCatch: true }],
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^(Toast|LobbyRenderer|LobbySocket|GameApi|ModalController|LobbyApp|\\$)$' }],
      },
    },
  ],
};
