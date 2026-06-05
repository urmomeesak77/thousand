'use strict';

const { roundScores, roundDeltas, buildFinalResults } = require('./Scoring');
const { VICTORY_THRESHOLD } = require('./GameRules');
const RoundSnapshot = require('./RoundSnapshot');
const { seatRange } = require('./Seats');

// Result-emission and round-end scoring for in-round actions. Extracted from
// RoundActionHandler so that "how a resolved action is announced" lives apart
// from "validate + dispatch the action". Couples only to the store (player
// nicknames, per-recipient send) and the pure Scoring helpers.
class RoundActionBroadcaster {
  constructor({ store }) {
    this._store = store;
  }

  fourNinesAwardedMsg(round, game, award) {
    const nickname = this._store.players.get(round.seatOrder[award.seat])?.nickname ?? null;
    const cumulativeScores = game.session
      ? { ...game.session.cumulativeScores }
      : round.getViewModelFor(award.seat).cumulativeScores;
    return { type: 'four_nines_awarded', seat: award.seat, nickname, amount: award.amount, cumulativeScores };
  }

  computeRoundEnd(game, round) {
    round.roundScores = roundScores(round);
    round.roundDeltas = roundDeltas(round.roundScores, round.declarerSeat, round.currentHighBid, round.playerCount);
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
        seatRange(round.playerCount).map((s) => [s, { ...round.summary.perPlayer[s] }])
      ),
    };
    // Feature 012 (T009): log the per-seat round result before applyRoundEnd so
    // this row precedes any barrel/zeros penalty rows applyRoundEnd may record.
    session.actionHistory.recordRoundScore(
      session.currentRoundNumber, round.roundDeltas, round.declarerSeat, round.currentHighBid,
    );
    session.applyRoundEnd(round.roundDeltas, summaryEntry);
    // cumulativeAfter must be read after applyRoundEnd so barrel/zero penalties are reflected
    for (const s of seatRange(round.playerCount)) {
      round.summary.perPlayer[s].cumulativeAfter = session.cumulativeScores[s];
      summaryEntry.perPlayer[s].cumulativeAfter = session.cumulativeScores[s];
      summaryEntry.perPlayer[s].penalties = round.summary.perPlayer[s].penalties;
    }
    round.summary.roundNumber = session.currentRoundNumber;
    const victoryReached = seatRange(round.playerCount).some((s) => session.cumulativeScores[s] >= VICTORY_THRESHOLD);
    round.summary.victoryReached = victoryReached;
    if (victoryReached) { session.gameStatus = 'game-over'; }
    return { victoryReached, finalResults: victoryReached ? buildFinalResults(session) : null };
  }

  broadcastPlayCardResults(
    game, round, playerId, cardId, marriageResult, isRoundComplete, victoryReached, finalResults,
  ) {
    const trickNumber = round.trickNumber;
    const playerSeat = round.seatByPlayer.get(playerId) ?? null;
    // Why: when the 3rd (trick-resolving) card is played, _resolveTrick clears
    // currentTrick before broadcast — and the collected pile belongs to the
    // *winner*, not necessarily the player who just played. Deriving from round
    // state therefore mis-identified the card for a 3rd-card non-winner. The
    // play_card handler already has the authoritative cardId; thread it through.
    const playedCardId = cardId;
    for (const pid of game.players) {
      const pSeat = round.seatByPlayer.get(pid);
      const gameStatus = round.getViewModelFor(pSeat);
      if (marriageResult) {
        this._broadcastMarriage(pid, gameStatus, marriageResult, trickNumber, playerSeat, playerId);
      }
      const cardPlayedMsg = { type: 'card_played', gameStatus };
      if (playerSeat !== null && playedCardId !== null) {
        cardPlayedMsg.playerSeat = playerSeat;
        cardPlayedMsg.cardId = playedCardId;
        // Centre-card identity travels with every card_played so the centre-flight
        // animation can render the 3rd (trick-resolving) card even though the
        // post-resolve snapshot has already cleared currentTrick.
        const cardObj = round.deck[playedCardId];
        if (cardObj) { cardPlayedMsg.card = { rank: cardObj.rank, suit: cardObj.suit }; }
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

  startAndBroadcastNextRound(game) {
    const session = game.session;
    session.startNextRound();
    const newRound = this._store.buildRound(game);
    const roundNumber = session.currentRoundNumber;
    for (const pid of game.players) {
      const selfSeat = newRound.seatByPlayer.get(pid);
      const gameStatus = newRound.getViewModelFor(selfSeat);
      const seats = RoundSnapshot.buildSeatLayout(newRound, selfSeat);
      const dealSequence = RoundSnapshot.buildDealSequenceFor(newRound, selfSeat);
      this._store.sendToPlayer(pid, { type: 'next_round_started', roundNumber, seats, dealSequence, gameStatus });
    }
    // Drive bot turns in the fresh round (bidding opens immediately).
    this._store.notifyTurnAdvanced?.(game);
  }

  _broadcastMarriage(pid, gameStatus, marriageResult, trickNumber, playerSeat, playerId) {
    const playerNickname = this._store.players.get(playerId)?.nickname ?? null;
    this._store.sendToPlayer(pid, {
      type: 'marriage_declared',
      playerSeat,
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
}

module.exports = RoundActionBroadcaster;
