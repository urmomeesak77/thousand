'use strict';

// Legal bid range, mirrored from src/services/Round.js (the auction validator) and
// src/public/js/thousand/constants.js (the client). Duplicated here rather than
// imported because Round.js keeps them as module-private locals and the client copy
// is an ES module not requirable from CommonJS. Keep in sync with both.
const MIN_BID = 100;
const MAX_BID = 300;
const BID_STEP = 5;
// A seat on barrel must bid at least this (mirrors Round.js BARREL_BID_FLOOR).
const BARREL_BID_FLOOR = 120;

// FR-016/FR-017: the most an aggressive bot adds on top of its safe makeable estimate,
// gambling on favourable hidden talon cards (≈ a completed marriage or a couple of aces).
// Caps even the boldest bot so it can miss a gambled contract but never runaway-overbid.
const MAX_TALON_GAMBLE = 30;

// FR-016/FR-017: a declarer must CAPTURE at least its bid to make the contract, so a
// realistic bot bids below its mean expectation by this margin (mean-bidding ≈ 50% miss).
// Aggressiveness erodes the margin via the talon gamble. Tuned in the bidding-realism plan.
const SAFETY_MARGIN = 15;

// Selling: how far below the bid a declarer tolerates before selling, and how far above
// the bid an opponent needs before buying. Both shrink with aggressiveness.
const SELL_CUSHION = 30;
const BUY_MARGIN = 20;

module.exports = { MIN_BID, MAX_BID, BID_STEP, BARREL_BID_FLOOR, MAX_TALON_GAMBLE, SAFETY_MARGIN, SELL_CUSHION, BUY_MARGIN };
