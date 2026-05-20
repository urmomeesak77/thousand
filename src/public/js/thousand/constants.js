export const MIN_BID = 100;
export const MAX_BID = 300;
export const BID_STEP = 5;
export const MIN_SELL_BID = MIN_BID + BID_STEP;
export const SELL_SELECTION_SIZE = 3;
export const MAX_SELL_ATTEMPTS = 3;
export const BARREL_BID_FLOOR = 120;
export const SPECIAL_PENALTY = 120;

// FR-013: card point values for trick scoring
export const CARD_POINT_VALUE = { A: 11, '10': 10, K: 4, Q: 3, J: 2, '9': 0 };

// FR-009: marriage bonus per suit (♣=100, ♠=80, ♥=60, ♦=40)
export const MARRIAGE_BONUS = { '♣': 100, '♠': 80, '♥': 60, '♦': 40 };

// FR-008: trick-winner rank ordering (Ten outranks K and Q; Ace is highest)
export const RANK_ORDER = { '9': 0, 'J': 1, 'Q': 2, 'K': 3, '10': 4, 'A': 5 };
