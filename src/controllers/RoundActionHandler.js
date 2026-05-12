'use strict';

const RateLimiter = require('../utils/RateLimiter');

class RoundActionHandler {
  constructor({ store }) {
    this._store = store;
    this._rateLimiter = new RateLimiter(250, 1);
  }

  _gameOf(playerId) {
    const player = this._store.players.get(playerId);
    if (!player?.gameId) return null;
    return this._store.games.get(player.gameId) ?? null;
  }

  _seatOf(playerId) {
    const game = this._gameOf(playerId);
    return game?.round?.seatByPlayer.get(playerId) ?? null;
  }

  _reject(playerId, reason) {
    this._store.sendToPlayer(playerId, { type: 'action_rejected', reason });
  }

  handleBid(_playerId, _amount) {}

  handlePass(_playerId) {}

  handleSellStart(_playerId) {}

  handleSellSelect(_playerId, _cardIds) {}

  handleSellCancel(_playerId) {}

  handleSellBid(_playerId, _amount) {}

  handleSellPass(_playerId) {}

  handleStartGame(_playerId) {}
}

module.exports = RoundActionHandler;
