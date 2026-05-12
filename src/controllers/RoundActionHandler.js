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

  // T027 + T044
  handleBid(playerId, amount) {
    if (!this._rateLimiter.isAllowed(playerId)) return;
    const game = this._gameOf(playerId);
    if (!game?.round) return this._reject(playerId, 'Not in a round');
    const round = game.round;
    if (round.phase === 'dealing') round.advanceFromDealingToBidding();
    const seat = this._seatOf(playerId);
    const result = round.submitBid(seat, amount);
    if (result.rejected) return this._reject(playerId, result.reason);
    const declarerPid = result.resolved ? round.seatOrder[round.declarerSeat] : null;
    for (const pid of game.players) {
      const pSeat = round.seatByPlayer.get(pid);
      const gameStatus = round.getViewModelFor(pSeat);
      this._store.sendToPlayer(pid, { type: 'bid_accepted', playerId, amount, gameStatus });
      if (result.resolved) {
        const msg = { type: 'talon_absorbed', declarerId: declarerPid, talonIds: result.talonIds, gameStatus };
        if (pid === declarerPid) msg.identities = result.identities;
        this._store.sendToPlayer(pid, msg);
      }
      this._store.sendToPlayer(pid, { type: 'phase_changed', phase: gameStatus.phase, gameStatus });
    }
  }

  // T028 + T044
  handlePass(playerId) {
    if (!this._rateLimiter.isAllowed(playerId)) return;
    const game = this._gameOf(playerId);
    if (!game?.round) return this._reject(playerId, 'Not in a round');
    const round = game.round;
    if (round.phase !== 'bidding') return this._reject(playerId, 'Not in bidding phase');
    const seat = this._seatOf(playerId);
    const result = round.submitPass(seat);
    if (result.rejected) return this._reject(playerId, result.reason);
    const declarerPid = result.resolved ? round.seatOrder[round.declarerSeat] : null;
    for (const pid of game.players) {
      const pSeat = round.seatByPlayer.get(pid);
      const gameStatus = round.getViewModelFor(pSeat);
      this._store.sendToPlayer(pid, { type: 'pass_accepted', playerId, gameStatus });
      if (result.resolved) {
        const msg = { type: 'talon_absorbed', declarerId: declarerPid, talonIds: result.talonIds, gameStatus };
        if (pid === declarerPid) msg.identities = result.identities;
        this._store.sendToPlayer(pid, msg);
      }
      this._store.sendToPlayer(pid, { type: 'phase_changed', phase: gameStatus.phase, gameStatus });
    }
  }

  handleSellStart(_playerId) {}

  handleSellSelect(_playerId, _cardIds) {}

  handleSellCancel(_playerId) {}

  handleSellBid(_playerId, _amount) {}

  handleSellPass(_playerId) {}

  // T043
  handleStartGame(playerId) {
    if (!this._rateLimiter.isAllowed(playerId)) return;
    const game = this._gameOf(playerId);
    if (!game?.round) return this._reject(playerId, 'Not in a round');
    const round = game.round;
    const seat = this._seatOf(playerId);
    const result = round.startGame(seat);
    if (result.noop) return;
    if (result.rejected) return this._reject(playerId, result.reason);
    const { declarerId, finalBid } = result;
    const gameId = game.id;
    for (const pid of game.players) {
      const pSeat = round.seatByPlayer.get(pid);
      const gameStatus = round.getViewModelFor(pSeat);
      this._store.sendToPlayer(pid, { type: 'play_phase_ready', declarerId, finalBid, gameStatus });
    }
    this._store._cleanupRound(gameId);
  }
}

module.exports = RoundActionHandler;
