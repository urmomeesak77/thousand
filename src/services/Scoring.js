'use strict';

// FR-013: card point values for trick scoring
const CARD_POINT_VALUE = { A: 11, '10': 10, K: 4, Q: 3, J: 2, '9': 0 };

// FR-009: marriage bonus per suit (♣=100, ♠=80, ♥=60, ♦=40)
const MARRIAGE_BONUS = { '♣': 100, '♠': 80, '♥': 60, '♦': 40 };

// FR-008: trick-winner rank ordering (Ten outranks K and Q; Ace is highest)
const RANK_ORDER = { '9': 0, 'J': 1, 'Q': 2, 'K': 3, '10': 4, 'A': 5 };

// Method bodies filled in US1 (cardPoints, roundScores, roundDeltas),
// US2 (roundScores extended for marriages), US3 (determineWinner, buildFinalResults).

module.exports = { CARD_POINT_VALUE, MARRIAGE_BONUS, RANK_ORDER };
