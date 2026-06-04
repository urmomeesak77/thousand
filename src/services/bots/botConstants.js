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

module.exports = { MIN_BID, MAX_BID, BID_STEP, BARREL_BID_FLOOR, MAX_TALON_GAMBLE };
