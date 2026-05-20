'use strict';

const { BARREL_MIN, BARREL_MAX, SPECIAL_PENALTY, BARREL_ROUND_LIMIT, ZERO_ROUND_LIMIT } = require('./GameRules');

// FR-013: card point values for trick scoring
const CARD_POINT_VALUE = { A: 11, '10': 10, K: 4, Q: 3, J: 2, '9': 0 };

// FR-009: marriage bonus per suit (♣=100, ♠=80, ♥=60, ♦=40)
const MARRIAGE_BONUS = { '♣': 100, '♠': 80, '♥': 60, '♦': 40 };

// FR-008: trick-winner rank ordering (Ten outranks K and Q; Ace is highest)
const RANK_ORDER = { '9': 0, 'J': 1, 'Q': 2, 'K': 3, '10': 4, 'A': 5 };

function cardPoints(cards) {
  return cards.reduce((sum, { rank }) => sum + CARD_POINT_VALUE[rank], 0);
}

function roundScores(round) {
  const scores = { 0: 0, 1: 0, 2: 0 };
  for (const seat of [0, 1, 2]) {
    const ids = round.collectedTricks[seat] ?? [];
    scores[seat] += cardPoints(ids.map(id => round.deck[id]));
  }
  for (const m of round.declaredMarriages) {
    const seat = m.playerSeat;
    scores[seat] += MARRIAGE_BONUS[m.suit];
  }
  return scores;
}

function roundDeltas(roundScoresMap, declarerSeat, bid, _penalties = []) {
  const deltas = { 0: 0, 1: 0, 2: 0 };
  for (const seat of [0, 1, 2]) {
    if (seat === declarerSeat) {
      deltas[seat] = roundScoresMap[seat] >= bid ? bid : -bid;
    } else {
      deltas[seat] = roundScoresMap[seat];
    }
  }
  return deltas;
}

// FR-017: Determines the winner when at least one player reaches >= 1000
function determineWinner(game) {
  // Step 1: Find the maximum cumulativeScore
  const maxScore = Math.max(
    game.cumulativeScores[0],
    game.cumulativeScores[1],
    game.cumulativeScores[2]
  );

  // Step 2: Find all seats at that maximum (the tied set)
  const tied = [];
  for (const seat of [0, 1, 2]) {
    if (game.cumulativeScores[seat] === maxScore) {
      tied.push(seat);
    }
  }

  // Step 3: If only one seat at max, they win
  if (tied.length === 1) {
    return { winnerSeat: tied[0] };
  }

  // Step 4: Multiple seats tied at max
  const declarerSeat = game.history[game.history.length - 1].declarerSeat;

  // Step 4(a): If declarer is among tied, declarer wins
  if (tied.includes(declarerSeat)) {
    return { winnerSeat: declarerSeat };
  }

  // Step 4(b): Seat-order fallback
  // P1 = (dealerSeat + 1) % 3   (highest priority)
  // P2 = (dealerSeat + 2) % 3   (middle priority)
  // Dealer = dealerSeat         (lowest priority)
  const P1 = (game.dealerSeat + 1) % 3;
  const P2 = (game.dealerSeat + 2) % 3;
  const Dealer = game.dealerSeat;

  // Return the first of [P1, P2, Dealer] that is in the tied set
  for (const seat of [P1, P2, Dealer]) {
    if (tied.includes(seat)) {
      return { winnerSeat: seat };
    }
  }
}

// FR-017: Builds the FinalResults view-model when the game ends
function buildFinalResults(game) {
  // Step 1: Determine the winner
  const { winnerSeat } = determineWinner(game);

  // Step 2: Build finalRanking as an array of all 3 seats sorted descending by cumulativeScore
  const finalRanking = [];
  for (const seat of [0, 1, 2]) {
    finalRanking.push({
      seat,
      nickname: game.nicknames[seat],
      cumulativeScore: game.cumulativeScores[seat],
      isWinner: seat === winnerSeat,
    });
  }
  // Sort descending by cumulativeScore
  finalRanking.sort((a, b) => b.cumulativeScore - a.cumulativeScore);

  // Step 3: Return the FinalResults object
  return {
    winnerSeat,
    winnerNickname: game.nicknames[winnerSeat],
    finalRanking,
    history: game.history,
  };
}

// FR-023/FR-024: pre-compute which penalties will fire this round when session state is available.
function applyPenaltyAnnotations(session, perPlayer, deltas) {
  for (const seat of [0, 1, 2]) {
    const row = perPlayer[seat];
    const { trickPoints, marriageBonus } = row;

    // Barrel penalty (FR-023): fires when the player has been on barrel for
    // BARREL_ROUND_LIMIT rounds AND the score after this round's delta stays
    // in the barrel range [BARREL_MIN, BARREL_MAX).
    const bs = session.barrelState[seat];
    if (bs && bs.onBarrel) {
      const willBeThirdBarrelRound = (bs.barrelRoundsUsed + 1) === BARREL_ROUND_LIMIT;
      if (willBeThirdBarrelRound) {
        const scoreAfterDelta = session.cumulativeScores[seat] + deltas[seat];
        if (scoreAfterDelta >= BARREL_MIN && scoreAfterDelta < BARREL_MAX) {
          row.penalties.push('barrel');
          row.delta -= SPECIAL_PENALTY;
        }
      }
    }

    // Zero-round penalty (FR-024): fires when consecutiveZeros reaches ZERO_ROUND_LIMIT.
    const roundScore = trickPoints + marriageBonus;
    const currentZeros = session.consecutiveZeros[seat] ?? 0;
    const newZeroCount = currentZeros + (roundScore === 0 ? 1 : 0);
    if (newZeroCount === ZERO_ROUND_LIMIT) {
      row.penalties.push('three-zeros');
      row.delta -= SPECIAL_PENALTY;
    }
  }
}

module.exports = { CARD_POINT_VALUE, MARRIAGE_BONUS, RANK_ORDER, cardPoints, roundScores, roundDeltas, determineWinner, buildFinalResults, applyPenaltyAnnotations };
