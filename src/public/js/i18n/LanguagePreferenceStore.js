// Persists the chosen display language in localStorage. The in-memory
// language in I18n is the session source of truth; this store only seeds it
// at boot and records explicit user choices. Anything other than a supported
// language id — including a read failure (Safari private mode) — reads as
// null, so boot falls through to browser-language detection (FR-008).

const STORAGE_KEY = 'thousand_lang';
const SUPPORTED = ['en', 'ru'];

export class LanguagePreferenceStore {
  constructor(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    this._storage = storage;
  }

  get() {
    try {
      const value = this._storage.getItem(STORAGE_KEY);
      return SUPPORTED.includes(value) ? value : null;
    } catch {
      // Storage disabled or access denied — treat as no stored preference.
      return null;
    }
  }

  set(id) {
    try {
      this._storage.setItem(STORAGE_KEY, id);
    } catch {
      // Best-effort: losing the preference for one session beats crashing the
      // language toggle that called set().
    }
  }
}
