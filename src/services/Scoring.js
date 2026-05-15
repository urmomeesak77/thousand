'use strict';

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

module.exports = { CARD_POINT_VALUE, MARRIAGE_BONUS, RANK_ORDER, cardPoints, roundScores, roundDeltas };
