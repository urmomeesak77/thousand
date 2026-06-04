// ============================================================
// GameApi — all HTTP calls to the game API
// ============================================================

import { BASE_PATH } from '../utils/basePath.js';

class GameApi {
  constructor(onError) {
    this._onError = onError;
    this._sessionToken = null;
  }

  setSessionToken(token) {
    this._sessionToken = token;
  }

  async claimNickname(nickname) {
    try {
      const { res, data } = await this._post('/api/nickname', { nickname });
      if (!res.ok) {
        this._onError(data.message || 'Nickname unavailable');
        return false;
      }
      return true;
    } catch {
      this._onError('Network error. Please try again.');
      return false;
    }
  }

  async join(gameId, nickname) {
    if (!nickname) {
      this._onError('Enter a nickname first.');
      return null;
    }
    try {
      const { res, data } = await this._post(`/api/games/${gameId}/join`, { nickname });
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

  async create(type, nickname, requiredPlayers) {
    try {
      const { res, data } = await this._post('/api/games', { type, nickname, requiredPlayers });
      if (!res.ok) {
        this._onError(data.message || 'Failed to create game');
        return null;
      }
      return data;
    } catch {
      this._onError('Network error. Please try again.');
      return null;
    }
  }

  async joinWithCode(code, nickname) {
    try {
      const { res, data } = await this._post('/api/games/join-invite', { code, nickname });
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

  async leave(gameId) {
    // Why: the server returns 404 when the game/membership no longer exists
    // (round ended in victory, opponent already left and triggered cleanup,
    // race after a round_aborted broadcast). The intent of /leave is "drop me
    // from this game" — if the server has already done that, we've succeeded.
    // Surfacing a toast just confuses the user with a phantom error.
    if (!gameId) { return true; }
    try {
      const { res, data } = await this._post(`/api/games/${gameId}/leave`, {});
      if (res.ok || res.status === 404) { return true; }
      this._onError(data.message || 'Failed to leave game');
      return false;
    } catch {
      this._onError('Network error. Please try again.');
      return false;
    }
  }

  async addBot(gameId) {
    try {
      const { res, data } = await this._post(`/api/games/${gameId}/bots`, {});
      if (!res.ok) {
        this._onError(data.message || 'Failed to add bot');
        return null;
      }
      return data;
    } catch {
      this._onError('Network error. Please try again.');
      return null;
    }
  }

  async logout() {
    // Best-effort: the server purges the player so the nickname frees up at
    // once. Even if this call fails (network/offline), the caller still clears
    // local identity and reloads — the orphaned record expires with the grace
    // window — so a failure here must not block logout or surface an error.
    try {
      await this._post('/api/logout', {});
    } catch {
      // swallow — logout proceeds client-side regardless
    }
  }

  async _post(url, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this._sessionToken) {
      headers['Authorization'] = `Bearer ${this._sessionToken}`;
    }
    const res = await fetch(`${BASE_PATH}${url}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      // Non-JSON error page (e.g. HTML 502 from a proxy) — preserve a snippet so
      // callers can surface something useful instead of swallowing it silently.
      data = { message: text.slice(0, 200) };
    }
    return { res, data };
  }
}

export default GameApi;
