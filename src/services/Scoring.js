'use strict';

const { BARREL_MIN, BARREL_MAX, SPECIAL_PENALTY, BARREL_ROUND_LIMIT, ZERO_ROUND_LIMIT } = require('./GameRules');
const { seatRange, initSeatMap } = require('./Seats');

// FR-013/FR-007: card point values for trick scoring. 7 and 8 (4-player deck only)
// are worth 0, so total trick points stay 120 in both decks. Inert for 24-card decks.
const CARD_POINT_VALUE = { A: 11, '10': 10, K: 4, Q: 3, J: 2, '9': 0, '8': 0, '7': 0 };

// FR-009: marriage bonus per suit (♣=100, ♠=80, ♥=60, ♦=40)
const MARRIAGE_BONUS = { '♣': 100, '♠': 80, '♥': 60, '♦': 40 };

// FR-008: trick-winner rank ordering (Ten outranks K and Q; Ace is highest). 7 and 8
// (4-player deck only) rank below the 9; the 9→A relative order is preserved so every
// existing 3-player trick-winner result is unchanged (a 24-card deck never holds 7/8).
const RANK_ORDER = { '7': 0, '8': 1, '9': 2, 'J': 3, 'Q': 4, 'K': 5, '10': 6, 'A': 7 };

function cardPoints(cards) {
  return cards.reduce((sum, { rank }) => sum + CARD_POINT_VALUE[rank], 0);
}

// FR-001: At trick-play start, return the seat whose hand holds all four 9s
// (one per suit), or null if the 9s are split, sit in the talon, or were passed
// away in the exchange. `hands` maps seat → card-id list; `deck[id]` is the card.
function findFourNinesSeat(hands, deck, playerCount = 3) {
  for (const seat of seatRange(playerCount)) {
    const nineCount = hands[seat].filter(id => deck[id]?.rank === '9').length;
    if (nineCount === 4) { return seat; }
  }
  return null;
}

// FR-001: At trick-play start, report whether a hand holds an ace of any suit.
// Drives crawl eligibility — the declarer may crawl only when this is false for
// the post-talon-pickup, post-exchange 8-card hand. `handCardIds` is a card-id
// list; `deck[id]` is the card.
function handHasAce(handCardIds, deck) {
  return handCardIds.some(id => deck[id]?.rank === 'A');
}

function roundScores(round) {
  const scores = initSeatMap(round.playerCount ?? 3, 0);
  for (const seat of seatRange(round.playerCount ?? 3)) {
    const ids = round.collectedTricks[seat] ?? [];
    scores[seat] += cardPoints(ids.map(id => round.deck[id]));
  }
  for (const m of round.declaredMarriages) {
    const seat = m.playerSeat;
    scores[seat] += MARRIAGE_BONUS[m.suit] ?? 0;
  }
  return scores;
}

function roundDeltas(roundScoresMap, declarerSeat, bid, playerCount = 3, onBarrelSeats = new Set()) {
  // The 4th positional arg was historically an (ignored) `penalties` array in
  // feature 005; tolerate a non-integer here so those legacy callers default to 3.
  const n = Number.isInteger(playerCount) ? playerCount : 3;
  const deltas = initSeatMap(n, 0);
  for (const seat of seatRange(n)) {
    if (seat === declarerSeat) {
      deltas[seat] = roundScoresMap[seat] >= bid ? bid : -bid;
    } else if (onBarrelSeats.has(seat)) {
      // On the barrel: a non-declarer scores nothing — points come only from
      // winning a bid (design 2026-06-05-barrel-non-declarer-scoring).
      deltas[seat] = 0;
    } else {
      deltas[seat] = roundScoresMap[seat];
    }
  }
  return deltas;
}

// FR-017/FR-016: Determines the winner when at least one player reaches >= 1000
function determineWinner(game) {
  const n = game.playerCount ?? 3;
  const seats = seatRange(n);

  // Step 1: Find the maximum cumulativeScore
  const maxScore = Math.max(...seats.map((seat) => game.cumulativeScores[seat]));

  // Step 2: Find all seats at that maximum (the tied set)
  const tied = seats.filter((seat) => game.cumulativeScores[seat] === maxScore);

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

  // Step 4(b): Seat-order fallback, clockwise from the dealer (FR-016):
  // P1 = (dealer+1) % n (highest priority) … P(n-1), then the Dealer (lowest).
  const priority = seats.map((i) => (game.dealerSeat + 1 + i) % n);
  for (const seat of priority) {
    if (tied.includes(seat)) {
      return { winnerSeat: seat };
    }
  }
  // Unreachable: `priority` is a permutation of all seats and `tied` is a non-empty
  // subset, so the loop above must return. Fall back to the first tied seat so a
  // future refactor that breaks the invariant doesn't yield `undefined`.
  return { winnerSeat: tied[0] };
}

// FR-017: Builds the FinalResults view-model when the game ends
function buildFinalResults(game) {
  // Step 1: Determine the winner
  const { winnerSeat } = determineWinner(game);

  // Step 2: Build finalRanking over all seats sorted descending by cumulativeScore
  const finalRanking = [];
  for (const seat of seatRange(game.playerCount ?? 3)) {
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
  for (const seat of seatRange(session.playerCount ?? 3)) {
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

module.exports = {
  CARD_POINT_VALUE, MARRIAGE_BONUS, RANK_ORDER, cardPoints, findFourNinesSeat, handHasAce,
  roundScores, roundDeltas, determineWinner, buildFinalResults, applyPenaltyAnnotations,
};
