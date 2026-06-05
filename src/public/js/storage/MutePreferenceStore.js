// Persists the mute preference as a boolean mirror in localStorage. The
// in-memory mute state in SoundManager is the session source of truth; this
// store only seeds it on load and records changes. First-time / unreadable
// storage defaults to unmuted (false), mirroring IdentityStore's best-effort
// access pattern.

const STORAGE_KEY = 'thousand_muted';

export class MutePreferenceStore {
  constructor(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    this._storage = storage;
  }

  get() {
    try {
      return this._storage.getItem(STORAGE_KEY) === 'true';
    } catch {
      // Storage disabled (Safari private mode) or access denied — default unmuted.
      return false;
    }
  }

  set(muted) {
    try {
      this._storage.setItem(STORAGE_KEY, muted ? 'true' : 'false');
    } catch {
      // Best-effort: losing the preference for one session beats crashing the
      // mute toggle that called set().
    }
  }
}
