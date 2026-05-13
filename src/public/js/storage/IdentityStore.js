const STORAGE_KEY = 'thousand_identity';

export class IdentityStore {
  static save(playerId, sessionToken) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ playerId, sessionToken }));
      return true;
    } catch {
      // Quota exceeded, storage disabled (Safari private mode), or storage access denied.
      // Persistence is best-effort — losing it for one session is better than crashing
      // the message handler that called save().
      return false;
    }
  }

  static load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      // Reject non-objects, arrays, and anything whose prototype isn't Object.prototype
      // (defends against malicious storage payloads attempting prototype pollution).
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }
      if (Object.getPrototypeOf(parsed) !== Object.prototype) {
        return {};
      }
      const out = {};
      if (typeof parsed.playerId === 'string') {
        out.playerId = parsed.playerId;
      }
      if (typeof parsed.sessionToken === 'string') {
        out.sessionToken = parsed.sessionToken;
      }
      return out;
    } catch {
      return {};
    }
  }

  static clear() {
    localStorage.removeItem(STORAGE_KEY);
  }
}
