'use strict';

const RateLimiter = require('../utils/RateLimiter');
const RoundActionBroadcaster = require('../services/RoundActionBroadcaster');
const TrickPlayActionHandler = require('./TrickPlayActionHandler');

class RoundActionHandler {
  constructor({ store }) {
    this._store = store;
    this._broadcaster = new RoundActionBroadcaster({ store });
    this._rateLimiter = new RateLimiter(250, 1);
    // Snapshot needs its own bucket: the rejection-recovery path fires
    // request_snapshot immediately after a rejected action, which would
    // otherwise be silently dropped by the shared limiter and leave the
    // client stuck in a divergent state. 50 ms × 1 = 20 snapshots/sec/player,
    // far above any natural recovery rate but bounded against flooding.
    this._snapshotLimiter = new RateLimiter(50, 1);
    // Bypass-the-limiter trick-play actions; borrows the plumbing above, so it
    // must be constructed after store / rate limiter / broadcaster are set.
    this._trickPlay = new TrickPlayActionHandler(this);
  }

  // Called by the periodic cleanup cron; without this, the rate-limiter Maps
  // keep an entry for every player ID that ever submitted a round action.
  cleanupRateLimiter() {
    this._rateLimiter.cleanup();
    this._snapshotLimiter.cleanup();
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
    // Let the bot driver react to the new turn state (no-op when no bots are seated).
    this._store.notifyTurnAdvanced?.(game);
    return { game, round, result };
  }

  // T027 + T044
  handleBid(playerId, amount) {
    const outcome = this._runRoundAction(
      playerId,
      (round, seat) => round.submitBid(seat, amount),
      (pid, gameStatus, result, { round }) => {
        this._store.sendToPlayer(pid, { type: 'bid_accepted', playerId, amount, gameStatus });
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
    this._recordAuction(outcome, playerId, (history, seat, round) => history.recordBid(seat, amount, round));
  }

  // T028 + T044
  handlePass(playerId) {
    const outcome = this._runRoundAction(
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
    this._recordAuction(outcome, playerId, (history, seat, round) => history.recordPass(seat, round));
  }

  // Append one auction history entry (feature 012) for a resolved bid/pass.
  // No-op when the action was rejected/noop (outcome is undefined) or the game
  // has no session yet. The seat is the actor's stable seat (FR-016).
  _recordAuction(outcome, playerId, append) {
    const session = outcome?.game?.session;
    if (!session) { return; }
    const seat = outcome.round.seatByPlayer.get(playerId);
    append(session.actionHistory, seat, session.currentRoundNumber);
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

  // Trick-play actions (start-game, exchange pass, four-nines ack, play card,
  // crawl commit) are delegated to TrickPlayActionHandler. They stay on this
  // class's surface because ConnectionManager's dispatch table targets it.
  handleStartGame(playerId) {
    this._trickPlay.handleStartGame(playerId);
  }

  handleExchangePass(playerId, cardId, toSeat) {
    this._trickPlay.handleExchangePass(playerId, cardId, toSeat);
  }

  handleAcknowledgeFourNines(playerId) {
    this._trickPlay.handleAcknowledgeFourNines(playerId);
  }

  handlePlayCard(playerId, cardId, declareMarriage = false) {
    this._trickPlay.handlePlayCard(playerId, cardId, declareMarriage);
  }

  handleCrawlCommit(playerId, cardId) {
    this._trickPlay.handleCrawlCommit(playerId, cardId);
  }

  // T069 — FR-016: continue to next round
  handleContinueToNextRound(playerId) {
    if (!this._rateLimiter.isAllowed(playerId)) {
      return;
    }
    const player = this._store.players.get(playerId);
    if (!player?.gameId) {
      this._reject(playerId, 'Not in a game');
      return;
    }
    const game = this._store.games.get(player.gameId);
    if (!game?.round) {
      this._reject(playerId, 'Not in a round');
      return;
    }
    const round = game.round;
    const session = game.session;
    if (round.phase !== 'round-summary') {
      this._reject(playerId, 'Not in round-summary phase');
      return;
    }
    if (!session || session.gameStatus !== 'in-progress') {
      this._reject(playerId, 'Game is not in progress');
      return;
    }
    const seat = round.seatByPlayer.get(playerId);
    if (seat === null || seat === undefined) {
      this._reject(playerId, 'Not in a round');
      return;
    }
    session.recordContinuePress(seat);
    const continuePressedSeats = [...session.continuePresses];
    for (const pid of game.players) {
      const pSeat = round.seatByPlayer.get(pid);
      const gameStatus = round.getViewModelFor(pSeat);
      this._store.sendToPlayer(pid, { type: 'continue_press_recorded', seat, continuePressedSeats, gameStatus });
      this._store.sendToPlayer(pid, { type: 'phase_changed', phase: gameStatus.phase, gameStatus });
    }
    if (session.continuePresses.size === round.playerCount) {
      this._broadcaster.startAndBroadcastNextRound(game);
    } else {
      // Schedule any remaining bots to press continue (the all-pressed branch
      // notifies via startAndBroadcastNextRound for the fresh round).
      this._store.notifyTurnAdvanced?.(game);
    }
  }

  // Client-initiated resync: emit a fresh round_state_snapshot to the requester.
  // Used by the client when it detects local state has diverged from the server
  // (e.g. action_rejected with reason "Card not in hand"). Rate-limited like
  // every other in-round action so it cannot be weaponized for flooding.
  handleRequestSnapshot(playerId) {
    if (!this._snapshotLimiter.isAllowed(playerId)) {
      return;
    }
    const game = this._gameOf(playerId);
    if (!game?.round) {
      return;
    }
    const seat = this._seatOf(playerId);
    if (seat === null || seat === undefined) {
      return;
    }
    const snapshot = game.round.getSnapshotFor(seat);
    if (snapshot) {
      this._store.sendToPlayer(playerId, snapshot);
    }
  }
}

module.exports = RoundActionHandler;
