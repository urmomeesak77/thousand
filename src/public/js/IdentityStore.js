export class IdentityStore {
  static save(playerId, sessionToken, nickname) {
    localStorage.setItem('thousand_identity', JSON.stringify({ playerId, sessionToken, nickname }));
  }

  static load() {
    try {
      return JSON.parse(localStorage.getItem('thousand_identity')) || {};
    } catch {
      return {};
    }
  }

  static clear() {
    localStorage.removeItem('thousand_identity');
  }
}
