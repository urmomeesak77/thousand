const STORAGE_KEY = 'thousand_identity';
// Persisted identity is considered stale 24h after the player was last seen.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export class IdentityStore {
  static save(playerId, sessionToken) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ playerId, sessionToken, lastSeen: Date.now() })
      );
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
      // Records without a fresh lastSeen (missing, non-numeric, or older than the
      // max age) are expired: drop them and report no identity.
      if (typeof parsed.lastSeen !== 'number' || Date.now() - parsed.lastSeen > MAX_AGE_MS) {
        IdentityStore.clear();
        return {};
      }
      const out = {};
      if (typeof parsed.playerId === 'string') {
        out.playerId = parsed.playerId;
      }
      if (typeof parsed.sessionToken === 'string') {
        out.sessionToken = parsed.sessionToken;
      }
      // Slide the 24h window forward on each active read ("24h after last seen").
      if (out.playerId && out.sessionToken) {
        IdentityStore.save(out.playerId, out.sessionToken);
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
