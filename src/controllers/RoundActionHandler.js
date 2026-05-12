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

  // T065
  handleSellStart(playerId) {
    if (!this._rateLimiter.isAllowed(playerId)) return;
    const game = this._gameOf(playerId);
    if (!game?.round) return this._reject(playerId, 'Not in a round');
    const round = game.round;
    const seat = this._seatOf(playerId);
    const result = round.startSelling(seat);
    if (result.rejected) return this._reject(playerId, result.reason);
    for (const pid of game.players) {
      const pSeat = round.seatByPlayer.get(pid);
      const gameStatus = round.getViewModelFor(pSeat);
      this._store.sendToPlayer(pid, { type: 'sell_started', gameStatus });
      this._store.sendToPlayer(pid, { type: 'phase_changed', phase: gameStatus.phase, gameStatus });
    }
  }

  handleSellSelect(playerId, cardIds) {
    if (!this._rateLimiter.isAllowed(playerId)) return;
    const game = this._gameOf(playerId);
    if (!game?.round) return this._reject(playerId, 'Not in a round');
    const round = game.round;
    const seat = this._seatOf(playerId);
    const result = round.commitSellSelection(seat, cardIds);
    if (result.rejected) return this._reject(playerId, result.reason);
    const declarerId = round.seatOrder[round.declarerSeat];
    const exposedIds = [...round.exposedSellCards];
    const identities = {};
    for (const id of exposedIds) {
      const card = round.deck[id];
      identities[id] = { rank: card.rank, suit: card.suit };
    }
    for (const pid of game.players) {
      const pSeat = round.seatByPlayer.get(pid);
      const gameStatus = round.getViewModelFor(pSeat);
      this._store.sendToPlayer(pid, { type: 'sell_exposed', declarerId, exposedIds, identities, gameStatus });
      this._store.sendToPlayer(pid, { type: 'phase_changed', phase: gameStatus.phase, gameStatus });
    }
  }

  handleSellCancel(playerId) {
    if (!this._rateLimiter.isAllowed(playerId)) return;
    const game = this._gameOf(playerId);
    if (!game?.round) return this._reject(playerId, 'Not in a round');
    const round = game.round;
    const seat = this._seatOf(playerId);
    const result = round.cancelSelling(seat);
    if (result.rejected) return this._reject(playerId, result.reason);
    for (const pid of game.players) {
      const pSeat = round.seatByPlayer.get(pid);
      const gameStatus = round.getViewModelFor(pSeat);
      this._store.sendToPlayer(pid, { type: 'phase_changed', phase: gameStatus.phase, gameStatus });
    }
  }

  handleSellBid(playerId, amount) {
    if (!this._rateLimiter.isAllowed(playerId)) return;
    const game = this._gameOf(playerId);
    if (!game?.round) return this._reject(playerId, 'Not in a round');
    const round = game.round;
    const seat = this._seatOf(playerId);
    const result = round.submitSellBid(seat, amount);
    if (result.rejected) return this._reject(playerId, result.reason);
    for (const pid of game.players) {
      const pSeat = round.seatByPlayer.get(pid);
      const gameStatus = round.getViewModelFor(pSeat);
      this._store.sendToPlayer(pid, { type: 'bid_accepted', playerId, amount, gameStatus });
      if (result.resolved) {
        const msg = {
          type: 'sell_resolved',
          outcome: result.outcome,
          oldDeclarerId: round.seatOrder[result.oldDeclarerSeat],
          exposedIds: result.exposedIds,
          gameStatus,
        };
        msg.newDeclarerId = round.seatOrder[round.declarerSeat];
        this._store.sendToPlayer(pid, msg);
      }
      this._store.sendToPlayer(pid, { type: 'phase_changed', phase: gameStatus.phase, gameStatus });
    }
  }

  handleSellPass(playerId) {
    if (!this._rateLimiter.isAllowed(playerId)) return;
    const game = this._gameOf(playerId);
    if (!game?.round) return this._reject(playerId, 'Not in a round');
    const round = game.round;
    const seat = this._seatOf(playerId);
    const result = round.submitSellPass(seat);
    if (result.rejected) return this._reject(playerId, result.reason);
    for (const pid of game.players) {
      const pSeat = round.seatByPlayer.get(pid);
      const gameStatus = round.getViewModelFor(pSeat);
      this._store.sendToPlayer(pid, { type: 'pass_accepted', playerId, gameStatus });
      if (result.resolved) {
        const msg = {
          type: 'sell_resolved',
          outcome: result.outcome,
          oldDeclarerId: result.outcome === 'sold'
            ? round.seatOrder[result.oldDeclarerSeat]
            : round.seatOrder[round.declarerSeat],
          exposedIds: result.exposedIds,
          gameStatus,
        };
        if (result.outcome === 'sold') msg.newDeclarerId = round.seatOrder[round.declarerSeat];
        this._store.sendToPlayer(pid, msg);
      }
      this._store.sendToPlayer(pid, { type: 'phase_changed', phase: gameStatus.phase, gameStatus });
    }
  }

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
