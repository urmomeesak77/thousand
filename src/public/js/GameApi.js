// ============================================================
// GameApi — all HTTP calls to the game API
// ============================================================

class GameApi {
  constructor(onError) {
    this._onError = onError;
  }

  async claimNickname(nickname, playerId) {
    try {
      const { res, data } = await this._post('/api/nickname', { nickname, playerId });
      if (!res.ok) { this._onError(data.message || 'Nickname unavailable'); return false; }
      return true;
    } catch {
      this._onError('Network error. Please try again.');
      return false;
    }
  }

  async join(gameId, nickname, playerId) {
    if (!nickname) { this._onError('Enter a nickname first.'); return null; }
    try {
      const { res, data } = await this._post(`/api/games/${gameId}/join`, { nickname, playerId });
      if (!res.ok) {
        this._onError(data.message || 'Failed to join game');
        return null;
      }
      return data;
    } catch {
      this._onError('Network error. Please try again.');
      return null;
    }
  }

  async create(type, nickname, playerId) {
    try {
      const { res, data } = await this._post('/api/games', { type, nickname, playerId });
      if (!res.ok) { this._onError(data.message || 'Failed to create game'); return null; }
      return data;
    } catch {
      this._onError('Network error. Please try again.');
      return null;
    }
  }

  async joinWithCode(code, nickname, playerId) {
    try {
      const { res, data } = await this._post('/api/games/join-invite', { code, nickname, playerId });
      if (!res.ok) {
        const msg = res.status === 404 ? 'Invalid or expired invite code'
          : data.message || 'Failed to join game';
        this._onError(msg);
        return null;
      }
      return data;
    } catch {
      this._onError('Network error. Please try again.');
      return null;
    }
  }

  async _post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { res, data: await res.json() };
  }
}

export default GameApi;
