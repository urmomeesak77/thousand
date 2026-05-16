'use strict';

const RateLimiter = require('../utils/RateLimiter');
const { roundScores, roundDeltas, buildFinalResults } = require('../services/Scoring');
const { VICTORY_THRESHOLD } = require('../services/GameRules');
const Round = require('../services/Round');
const RoundSnapshot = require('../services/RoundSnapshot');

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
      const msg = { type: 'card_passed', gameStatus };
      if (pSeat === toSeat) {
        const cardObj = round.deck[cardId];
        if (cardObj) {
          msg.passedCard = { id: cardObj.id, rank: cardObj.rank, suit: cardObj.suit };
        }
      }
      this._store.sendToPlayer(pid, msg);
      if (result.transitionedToTrickPlay) {
        this._store.sendToPlayer(pid, { type: 'trick_play_started', gameStatus });
      }
    }
  }

  _broadcastMarriage(pid, gameStatus, marriageResult, trickNumber, playerId) {
    const playerNickname = this._store.players.get(playerId)?.nickname ?? null;
    const seat = this._seatOf(playerId);
    this._store.sendToPlayer(pid, {
      type: 'marriage_declared',
      playerSeat: seat,
      playerNickname,
      suit: marriageResult.suit,
      bonus: marriageResult.bonus,
      trickNumber,
      newTrumpSuit: marriageResult.newTrumpSuit,
      gameStatus,
    });
    this._store.sendToPlayer(pid, {
      type: 'trump_changed',
      newTrumpSuit: marriageResult.newTrumpSuit,
      gameStatus,
    });
  }

  _broadcastRoundSummary(pid, gameStatus, summary) {
    this._store.sendToPlayer(pid, { type: 'round_summary', summary, gameStatus });
  }

  // Bypasses _runRoundAction for the same rate-limiter reason as handleExchangePass.
  handlePlayCard(playerId, cardId, declareMarriage = false) {
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
    // T045: If the client set declareMarriage, process it atomically before playCard.
    // declareMarriage mutates currentTrumpSuit which affects follow-suit validation in playCard.
    let marriageResult = null;
    if (declareMarriage) {
      marriageResult = round.declareMarriage(seat, cardId);
      if (marriageResult.rejected) {
        this._reject(playerId, marriageResult.reason);
        return;
      }
    }
    const result = round.playCard(seat, cardId);
    if (!result || result.noop) { return; }
    if (result.rejected) {
      this._reject(playerId, result.reason);
      return;
    }
    const isRoundComplete = result.trickResolved && result.roundComplete;
    const { victoryReached, finalResults } = isRoundComplete
      ? this._computeRoundEnd(game, round)
      : { victoryReached: false, finalResults: null };
    this._broadcastPlayCardResults(game, round, playerId, marriageResult, isRoundComplete, victoryReached, finalResults);
    if (isRoundComplete && victoryReached) {
      this._store._cleanupRound(game.id);
    }
  }

  _computeRoundEnd(game, round) {
    round.roundScores = roundScores(round);
    round.roundDeltas = roundDeltas(round.roundScores, round.declarerSeat, round.currentHighBid);
    round.buildSummary(game);
    const session = game.session;
    if (!session) { return { victoryReached: false, finalResults: null }; }

    const declarerPid = round.seatOrder[round.declarerSeat];
    const summaryEntry = {
      roundNumber: session.currentRoundNumber,
      declarerSeat: round.declarerSeat,
      declarerNickname: this._store.players.get(declarerPid)?.nickname ?? null,
      bid: round.currentHighBid,
      perPlayer: Object.fromEntries(
        [0, 1, 2].map((s) => [s, { ...round.summary.perPlayer[s] }])
      ),
    };
    session.applyRoundEnd(round.roundDeltas, summaryEntry);
    // cumulativeAfter must be read after applyRoundEnd so barrel/zero penalties are reflected
    for (const s of [0, 1, 2]) {
      round.summary.perPlayer[s].cumulativeAfter = session.cumulativeScores[s];
      summaryEntry.perPlayer[s].cumulativeAfter = session.cumulativeScores[s];
      summaryEntry.perPlayer[s].penalties = round.summary.perPlayer[s].penalties;
    }
    round.summary.roundNumber = session.currentRoundNumber;
    const victoryReached = [0, 1, 2].some((s) => session.cumulativeScores[s] >= VICTORY_THRESHOLD);
    round.summary.victoryReached = victoryReached;
    if (victoryReached) { session.gameStatus = 'game-over'; }
    return { victoryReached, finalResults: victoryReached ? buildFinalResults(session) : null };
  }

  _broadcastPlayCardResults(game, round, playerId, marriageResult, isRoundComplete, victoryReached, finalResults) {
    const trickNumber = round.trickNumber;
    const playerSeat = this._seatOf(playerId);
    // The last trick entry holds the card that was just played; safe across both
    // mid-trick (currentTrick has the new card) and end-of-trick (collectedTricks last).
    const lastTrickEntry = round.currentTrick?.length > 0
      ? round.currentTrick[round.currentTrick.length - 1]
      : null;
    const playedCardId = lastTrickEntry?.cardId
      ?? round.collectedTricks?.[playerSeat]?.[round.collectedTricks[playerSeat].length - 1]
      ?? null;
    for (const pid of game.players) {
      const pSeat = round.seatByPlayer.get(pid);
      const gameStatus = round.getViewModelFor(pSeat);
      if (marriageResult) {
        this._broadcastMarriage(pid, gameStatus, marriageResult, trickNumber, playerId);
      }
      const cardPlayedMsg = { type: 'card_played', gameStatus };
      if (playerSeat !== null && playedCardId !== null) {
        cardPlayedMsg.playerSeat = playerSeat;
        cardPlayedMsg.cardId = playedCardId;
      }
      this._store.sendToPlayer(pid, cardPlayedMsg);
      if (isRoundComplete) {
        this._broadcastRoundSummary(pid, gameStatus, round.summary);
        if (victoryReached) {
          this._store.sendToPlayer(pid, { type: 'final_results', finalResults, gameStatus });
        }
      }
    }
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
    if (session.continuePresses.size === 3) {
      this._startAndBroadcastNextRound(game);
    }
  }

  _startAndBroadcastNextRound(game) {
    const session = game.session;
    session.startNextRound();
    game.round = new Round({ game, store: this._store });
    game.round.start();
    game.round.advanceFromDealingToBidding();
    const newRound = game.round;
    const roundNumber = session.currentRoundNumber;
    for (const pid of game.players) {
      const selfSeat = newRound.seatByPlayer.get(pid);
      const gameStatus = newRound.getViewModelFor(selfSeat);
      const seats = RoundSnapshot.buildSeatLayout(newRound, selfSeat);
      const dealSequence = RoundSnapshot.buildDealSequenceFor(newRound, selfSeat);
      this._store.sendToPlayer(pid, { type: 'next_round_started', roundNumber, seats, dealSequence, gameStatus });
    }
  }
}

module.exports = RoundActionHandler;
