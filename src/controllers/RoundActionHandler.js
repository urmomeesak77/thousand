'use strict';

const RateLimiter = require('../utils/RateLimiter');

class RoundActionHandler {
  constructor({ store }) {
    this._store = store;
    this._rateLimiter = new RateLimiter(250, 1);
  }

  // Called by the periodic cleanup cron; without this, `_rateLimiter`'s internal
  // Map keeps an entry for every player ID that ever submitted a round action.
  cleanupRateLimiter() {
    this._rateLimiter.cleanup();
  }

  _gameOf(playerId) {
    const player = this._store.players.get(playerId);
    if (!player?.gameId) {
      return null;
    }
    return this._store.games.get(player.gameId) ?? null;
  }

  _seatOf(playerId) {
    const game = this._gameOf(playerId);
    return game?.round?.seatByPlayer.get(playerId) ?? null;
  }

  _reject(playerId, reason) {
    this._store.sendToPlayer(playerId, { type: 'action_rejected', reason });
  }

  // Common prelude for every in-round action: rate-limit, game/round lookup,
  // seat resolution, action invocation, rejection handling, per-recipient broadcast.
  // `action(round, seat)` performs the state mutation and returns the result object.
  // `broadcast(pid, gameStatus, result, ctx)` emits whatever messages the action needs.
  _runRoundAction(playerId, action, broadcast) {
    if (!this._rateLimiter.isAllowed(playerId)) {
      return;
    }
    const game = this._gameOf(playerId);
    if (!game?.round) {
      this._reject(playerId, 'Not in a round');
      return;
    }
    const round = game.round;
    const seat = this._seatOf(playerId);
    // A null seat means the player isn't seated in this round. Reject here
    // so per-phase round logic doesn't leak round state to non-participants
    // via descriptive rejection messages.
    if (seat === null || seat === undefined) {
      this._reject(playerId, 'Not in a round');
      return;
    }
    const result = action(round, seat);
    if (!result) {
      return;
    }
    if (result.noop) {
      return;
    }
    if (result.rejected) {
      this._reject(playerId, result.reason);
      return;
    }
    for (const pid of game.players) {
      const pSeat = round.seatByPlayer.get(pid);
      const gameStatus = round.getViewModelFor(pSeat);
      broadcast(pid, gameStatus, result, { game, round, playerId });
      this._store.sendToPlayer(pid, { type: 'phase_changed', phase: gameStatus.phase, gameStatus });
    }
    return { game, round, result };
  }

  // T027 + T044
  handleBid(playerId, amount) {
    this._runRoundAction(
      playerId,
      (round, seat) => round.submitBid(seat, amount),
      (pid, gameStatus) => {
        this._store.sendToPlayer(pid, { type: 'bid_accepted', playerId, amount, gameStatus });
      },
    );
  }

  // T028 + T044
  handlePass(playerId) {
    this._runRoundAction(
      playerId,
      (round, seat) => {
        if (round.phase !== 'bidding') {
          return { rejected: true, reason: 'Not in bidding phase' };
        }
        return round.submitPass(seat);
      },
      (pid, gameStatus, result, { round }) => {
        this._store.sendToPlayer(pid, { type: 'pass_accepted', playerId, gameStatus });
        if (result.resolved) {
          const declarerPid = round.seatOrder[round.declarerSeat];
          const msg = { type: 'talon_absorbed', declarerId: declarerPid, talonIds: result.talonIds, gameStatus };
          if (pid === declarerPid) {
            msg.identities = result.identities;
          }
          this._store.sendToPlayer(pid, msg);
        }
      },
    );
  }

  // T065
  handleSellStart(playerId) {
    this._runRoundAction(
      playerId,
      (round, seat) => round.startSelling(seat),
      (pid, gameStatus) => {
        this._store.sendToPlayer(pid, { type: 'sell_started', gameStatus });
      },
    );
  }

  handleSellSelect(playerId, cardIds) {
    this._runRoundAction(
      playerId,
      (round, seat) => round.commitSellSelection(seat, cardIds),
      (pid, gameStatus, _result, { round }) => {
        const declarerId = round.seatOrder[round.declarerSeat];
        const exposedIds = [...round.exposedSellCards];
        const identities = {};
        for (const id of exposedIds) {
          const card = round.deck[id];
          identities[id] = { rank: card.rank, suit: card.suit };
        }
        this._store.sendToPlayer(pid, { type: 'sell_exposed', declarerId, exposedIds, identities, gameStatus });
      },
    );
  }

  handleSellCancel(playerId) {
    this._runRoundAction(
      playerId,
      (round, seat) => round.cancelSelling(seat),
      () => {
        // phase_changed broadcast is emitted by _runRoundAction itself.
      },
    );
  }

  handleSellBid(playerId, amount) {
    this._runRoundAction(
      playerId,
      (round, seat) => round.submitSellBid(seat, amount),
      (pid, gameStatus, result, { round }) => {
        this._store.sendToPlayer(pid, { type: 'bid_accepted', playerId, amount, gameStatus });
        if (result.resolved) {
          this._store.sendToPlayer(pid, {
            type: 'sell_resolved',
            outcome: result.outcome,
            oldDeclarerId: round.seatOrder[result.oldDeclarerSeat],
            newDeclarerId: round.seatOrder[round.declarerSeat],
            exposedIds: result.exposedIds,
            gameStatus,
          });
        }
      },
    );
  }

  handleSellPass(playerId) {
    this._runRoundAction(
      playerId,
      (round, seat) => round.submitSellPass(seat),
      (pid, gameStatus, result, { round }) => {
        this._store.sendToPlayer(pid, { type: 'pass_accepted', playerId, gameStatus });
        if (result.resolved) {
          const oldDeclarerId = result.outcome === 'sold'
            ? round.seatOrder[result.oldDeclarerSeat]
            : round.seatOrder[round.declarerSeat];
          const msg = {
            type: 'sell_resolved',
            outcome: result.outcome,
            oldDeclarerId,
            exposedIds: result.exposedIds,
            gameStatus,
          };
          if (result.outcome === 'sold') {
            msg.newDeclarerId = round.seatOrder[round.declarerSeat];
          }
          this._store.sendToPlayer(pid, msg);
        }
      },
    );
  }

  // round stays alive for card-exchange phase (old code cleaned up the round here)
  handleStartGame(playerId) {
    if (!this._rateLimiter.isAllowed(playerId)) {
      return;
    }
    const game = this._gameOf(playerId);
    if (!game?.round) {
      this._reject(playerId, 'Not in a round');
      return;
    }
    const round = game.round;
    const seat = this._seatOf(playerId);
    if (seat === null || seat === undefined) {
      this._reject(playerId, 'Not in a round');
      return;
    }
    const result = round.startGame(seat);
    if (result.noop) {
      return;
    }
    if (result.rejected) {
      this._reject(playerId, result.reason);
      return;
    }
    const { declarerId, finalBid } = result;
    for (const pid of game.players) {
      const pSeat = round.seatByPlayer.get(pid);
      const gameStatus = round.getViewModelFor(pSeat);
      this._store.sendToPlayer(pid, { type: 'card_exchange_started', declarerId, finalBid, gameStatus });
    }
  }

  // Bypasses _runRoundAction: two passes arrive in quick succession and the shared
  // per-player rate limiter (250 ms / 1) would silently drop the second.
  handleExchangePass(playerId, cardId, toSeat) {
    const game = this._gameOf(playerId);
    if (!game?.round) {
      this._reject(playerId, 'Not in a round');
      return;
    }
    const round = game.round;
    const seat = this._seatOf(playerId);
    if (seat === null || seat === undefined) {
      this._reject(playerId, 'Not in a round');
      return;
    }
    const result = round.submitExchangePass(seat, cardId, toSeat);
    if (!result || result.noop) {
      return;
    }
    if (result.rejected) {
      this._reject(playerId, result.reason);
      return;
    }
    for (const pid of game.players) {
      const pSeat = round.seatByPlayer.get(pid);
      const gameStatus = round.getViewModelFor(pSeat);
      this._store.sendToPlayer(pid, { type: 'card_passed', gameStatus });
      if (result.transitionedToTrickPlay) {
        this._store.sendToPlayer(pid, { type: 'trick_play_started', gameStatus });
      }
    }
  }

  // Bypasses _runRoundAction for the same rate-limiter reason as handleExchangePass.
  handlePlayCard(playerId, cardId) {
    const game = this._gameOf(playerId);
    if (!game?.round) {
      this._reject(playerId, 'Not in a round');
      return;
    }
    const round = game.round;
    const seat = this._seatOf(playerId);
    if (seat === null || seat === undefined) {
      this._reject(playerId, 'Not in a round');
      return;
    }
    const result = round.playCard(seat, cardId);
    if (!result || result.noop) {
      return;
    }
    if (result.rejected) {
      this._reject(playerId, result.reason);
      return;
    }
    const isRoundComplete = result.trickResolved && result.roundComplete;
    if (isRoundComplete) {
      round.buildSummary(game);
    }
    for (const pid of game.players) {
      const pSeat = round.seatByPlayer.get(pid);
      const gameStatus = round.getViewModelFor(pSeat);
      this._store.sendToPlayer(pid, { type: 'card_played', gameStatus });
      if (isRoundComplete) {
        this._store.sendToPlayer(pid, { type: 'round_summary', summary: round.summary, gameStatus });
      }
    }
  }
}

module.exports = RoundActionHandler;
