'use strict';

// The in-round actions that bypass RoundActionHandler's shared per-player rate
// limiter because they legitimately arrive in quick succession (exchange passes,
// card plays, crawl commits) plus the start-game / four-nines-ack gates that
// frame trick play. Extracted from RoundActionHandler to keep that class focused
// on the auction actions and the shared dispatch plumbing. Borrows the owner's
// store, rate limiter, broadcaster, and game/seat lookup helpers.
class TrickPlayActionHandler {
  constructor(handler) {
    this._store = handler._store;
    this._rateLimiter = handler._rateLimiter;
    this._broadcaster = handler._broadcaster;
    this._gameOf = (playerId) => handler._gameOf(playerId);
    this._seatOf = (playerId) => handler._seatOf(playerId);
    this._reject = (playerId, reason) => handler._reject(playerId, reason);
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
    this._store.notifyTurnAdvanced?.(game);
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
    // FR-002: bank the four-nines bonus before building any view-model so the
    // broadcast cumulative scores reflect the +100 immediately (FR-018).
    const award = result.transitionedToTrickPlay ? result.fourNinesAward : null;
    if (award && game.session) {
      game.session.applyFourNinesBonus(award.seat);
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
      if (!result.transitionedToTrickPlay) { continue; }
      if (award) {
        // FR-003: announce the award and gate the first lead — trick_play_started
        // is withheld until all three acknowledge_four_nines arrive.
        this._store.sendToPlayer(pid, this._broadcaster.fourNinesAwardedMsg(round, game, award));
      } else {
        this._store.sendToPlayer(pid, { type: 'trick_play_started', gameStatus });
      }
    }
    this._store.notifyTurnAdvanced?.(game);
  }

  // FR-003/FR-027: each player acknowledges the four-nines modal. Sticky and
  // idempotent. When all three have acknowledged, release the held-back
  // trick_play_started so the declarer's first lead becomes operable.
  handleAcknowledgeFourNines(playerId) {
    if (!this._rateLimiter.isAllowed(playerId)) {
      return;
    }
    const game = this._gameOf(playerId);
    if (!game?.round) {
      return;
    }
    const round = game.round;
    const seat = this._seatOf(playerId);
    if (seat === null || seat === undefined) {
      return;
    }
    // No open gate → nothing to acknowledge; ignore silently (no toast).
    if (!round.fourNinesAckPending) {
      return;
    }
    const ack = round.recordFourNinesAck(seat);
    const acknowledgedSeats = ack.acknowledgedSeats ?? [...round.fourNinesAcks];
    for (const pid of game.players) {
      const pSeat = round.seatByPlayer.get(pid);
      const gameStatus = round.getViewModelFor(pSeat);
      this._store.sendToPlayer(pid, {
        type: 'four_nines_ack_progress',
        acknowledgedSeats,
        remaining: 3 - acknowledgedSeats.length,
        gameStatus,
      });
      if (ack.gateClosed) {
        this._store.sendToPlayer(pid, { type: 'trick_play_started', gameStatus });
      }
    }
    this._store.notifyTurnAdvanced?.(game);
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
      ? this._broadcaster.computeRoundEnd(game, round)
      : { victoryReached: false, finalResults: null };
    this._broadcaster.broadcastPlayCardResults(
      game, round, playerId, cardId, marriageResult, isRoundComplete, victoryReached, finalResults,
    );
    if (isRoundComplete && victoryReached) {
      this._store._cleanupRound(game.id);
    }
    // Drives the next trick-play turn, the round-summary continue presses, or
    // (after victory cleanup) safely no-ops because the game is gone.
    this._store.notifyTurnAdvanced?.(game);
  }

  // FR-003/FR-004/FR-006/FR-007: a single crawl_commit serves the declarer's
  // initiating commit and each opponent's response (disambiguated by turn order).
  // Bypasses _runRoundAction's shared limiter — commits arrive in quick
  // succession, like play_card/exchange_pass.
  handleCrawlCommit(playerId, cardId) {
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
    const result = round.commitCrawlCard(seat, cardId);
    if (!result || result.noop) { return; }
    if (result.rejected) {
      this._reject(playerId, result.reason);
      return;
    }
    for (const pid of game.players) {
      const pSeat = round.seatByPlayer.get(pid);
      const gameStatus = round.getViewModelFor(pSeat);
      if (result.crawlResolved) {
        // FR-005/FR-006: all three faces are disclosed exactly once, here.
        const commits = result.commits.map(({ seat: s, cardId: id }) => {
          const card = round.deck[id];
          return { seat: s, cardId: id, rank: card.rank, suit: card.suit };
        });
        this._store.sendToPlayer(pid, { type: 'crawl_revealed', commits, winnerSeat: result.winnerSeat, gameStatus });
      } else {
        // FR-005: progress only — no card identity.
        this._store.sendToPlayer(pid, {
          type: 'crawl_committed', seat, committedSeats: result.committedSeats, gameStatus,
        });
      }
    }
    this._store.notifyTurnAdvanced?.(game);
  }
}

module.exports = TrickPlayActionHandler;
