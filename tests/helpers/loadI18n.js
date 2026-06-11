'use strict';

// Test helper: load the real i18n stack (both catalogs + I18n) into a jsdom
// window and build an instance. Components under test receive production
// translations, so English assertions exercise the real en.js text and
// Russian assertions the real ru.js text (feature 013).

const { loadModule } = require('./loadModule');

function loadI18n(domInstance, { language = 'en', antlion } = {}) {
  if (!domInstance.window.I18n) {
    loadModule(domInstance, 'i18n/catalogs/en.js');
    loadModule(domInstance, 'i18n/catalogs/ru.js');
    loadModule(domInstance, 'i18n/I18n.js');
  }
  const i18n = new domInstance.window.I18n({
    antlion: antlion || { emit() {} },
    preferenceStore: { get: () => language, set() {} },
    navigatorLanguages: ['en-US'],
  });
  return i18n;
}

// Convenience: a bound t() for pure-formatter tests.
function makeT(domInstance, options) {
  const i18n = loadI18n(domInstance, options);
  return (key, params) => i18n.t(key, params);
}

module.exports = { loadI18n, makeT };
