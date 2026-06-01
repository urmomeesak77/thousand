export const MIN_BID = 100;
export const MAX_BID = 300;
export const BID_STEP = 5;
export const MIN_SELL_BID = MIN_BID + BID_STEP;
export const SELL_SELECTION_SIZE = 3;
export const MAX_SELL_ATTEMPTS = 3;
export const BARREL_BID_FLOOR = 120;
export const SPECIAL_PENALTY = 120;

// FR-013/FR-007: card point values for trick scoring. 7 and 8 (4-player deck only)
// are worth 0; inert for 24-card decks (kept in sync with src/services/Scoring.js).
export const CARD_POINT_VALUE = { A: 11, '10': 10, K: 4, Q: 3, J: 2, '9': 0, '8': 0, '7': 0 };

// FR-009: marriage bonus per suit (♣=100, ♠=80, ♥=60, ♦=40)
export const MARRIAGE_BONUS = { '♣': 100, '♠': 80, '♥': 60, '♦': 40 };

// FR-008: trick-winner rank ordering (Ten outranks K and Q; Ace is highest). 7 and 8
// (4-player deck only) rank below the 9; 9→A relative order preserved.
export const RANK_ORDER = { '7': 0, '8': 1, '9': 2, 'J': 3, 'Q': 4, 'K': 5, '10': 6, 'A': 7 };
