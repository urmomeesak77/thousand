export class IdentityStore {
  static save(playerId, sessionToken, nickname) {
    localStorage.setItem('thousand_identity', JSON.stringify({ playerId, sessionToken, nickname }));
  }

  static load() {
    try {
      const parsed = JSON.parse(localStorage.getItem('thousand_identity'));
      // Reject non-objects, arrays, and anything whose prototype isn't Object.prototype
      // (defends against malicious storage payloads attempting prototype pollution).
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      if (Object.getPrototypeOf(parsed) !== Object.prototype) return {};
      const out = {};
      if (typeof parsed.playerId === 'string') out.playerId = parsed.playerId;
      if (typeof parsed.sessionToken === 'string') out.sessionToken = parsed.sessionToken;
      if (typeof parsed.nickname === 'string' || parsed.nickname === null) out.nickname = parsed.nickname;
      return out;
    } catch {
      return {};
    }
  }

  static clear() {
    localStorage.removeItem('thousand_identity');
  }
}
