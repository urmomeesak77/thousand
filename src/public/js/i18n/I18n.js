import en from './catalogs/en.js';
import ru from './catalogs/ru.js';

// Resolves UI message keys against the per-language catalogs
// (contracts/i18n-api.md). English is the universal fallback: a key missing
// from the active catalog resolves from en.js, then params.fallback, then the
// key itself — t() never returns an empty string (FR-009).

const SUPPORTED_LANGUAGES = [
  { id: 'en', selfName: 'English' },
  { id: 'ru', selfName: 'Русский' },
];

// The English-catalog fallback must pluralize with English rules — the active
// language's rules would pick categories (few/many) that en values never have.
const EN_PLURALS = new Intl.PluralRules('en');

// Within a plural value, a missing selected category falls back in this order
// before giving up on the value (contracts/i18n-api.md).
const CATEGORY_FALLBACKS = ['many', 'other', 'few', 'one'];

class I18n {
  constructor({ antlion, preferenceStore, navigatorLanguages } = {}) {
    this._antlion = antlion;
    this._store = preferenceStore;
    this._catalogs = { en, ru };
    this._language = this._resolveInitialLanguage(navigatorLanguages);
    this._plurals = new Intl.PluralRules(this._language);
  }

  get language() {
    return this._language;
  }

  t(key, params) {
    const text = this._resolveValue(this._catalogs[this._language][key], this._plurals, params)
      || this._resolveValue(this._catalogs.en[key], EN_PLURALS, params)
      || (params && params.fallback)
      || key;
    return this._interpolate(text, params);
  }

  setLanguage(id) {
    // Idempotent and unsupported calls are silent no-ops: nothing persisted,
    // nothing emitted, so subscribers never re-render for a non-change.
    if (id === this._language || !SUPPORTED_LANGUAGES.some((l) => l.id === id)) {
      return;
    }
    this._language = id;
    this._plurals = new Intl.PluralRules(id);
    this._store.set(id);
    this._antlion.emit('language:changed', { language: id });
  }

  // Stored preference wins; otherwise only the FIRST browser language decides
  // (primary subtag ru → ru, anything else → en, FR-007/FR-008).
  _resolveInitialLanguage(navigatorLanguages) {
    const stored = this._store && this._store.get();
    if (stored) {
      return stored;
    }
    const first = (navigatorLanguages && navigatorLanguages[0]) || '';
    return first.toLowerCase().split('-')[0] === 'ru' ? 'ru' : 'en';
  }

  // One catalog value → display string, or null when this catalog can't
  // provide one (missing key, empty string, exhausted plural categories).
  _resolveValue(value, plurals, params) {
    if (typeof value === 'string') {
      return value || null;
    }
    if (!value || typeof value !== 'object') {
      return null;
    }
    const count = params && typeof params.count === 'number' ? params.count : 0;
    for (const category of [plurals.select(count), ...CATEGORY_FALLBACKS]) {
      if (typeof value[category] === 'string' && value[category]) {
        return value[category];
      }
    }
    return null;
  }

  // Unknown {tokens} stay literal — a visible bug beats a crash.
  _interpolate(text, params) {
    if (!params) {
      return text;
    }
    return text.replace(/\{(\w+)\}/g, (token, name) =>
      params[name] === undefined ? token : String(params[name]),
    );
  }
}

I18n.SUPPORTED_LANGUAGES = SUPPORTED_LANGUAGES;

export default I18n;
