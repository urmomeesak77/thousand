'use strict';

const { BARREL_MIN, BARREL_MAX } = require('./GameRules');

// Test-only score seam. Inert in production (returns null unless
// THOUSAND_SEED_SCORES is set), it lets the quickstart and the end-game e2e
// start a fresh game from arbitrary cumulative scores — e.g. "700,700,700" or
// "900,820,760" — so the barrel and victory paths are reachable in a round or
// two instead of ~10 full rounds. Format: comma-separated integers, one per
// seat in seat order; the entry count must equal playerCount or the seam stays
// inert (returns null), leaving the default 0,0,… start untouched.
function seededScoresForTest(playerCount) {
  // Hard-disabled in production: this seam would otherwise let a set env var
  // start a game from arbitrary cumulative scores.
  if (process.env.NODE_ENV === 'production') { return null; }
  const raw = process.env.THOUSAND_SEED_SCORES;
  if (!raw) { return null; }
  const values = raw.split(',').map((s) => Number.parseInt(s.trim(), 10));
  if (values.length !== playerCount || values.some((v) => !Number.isInteger(v))) {
    return null;
  }
  const scores = {};
  for (let seat = 0; seat < playerCount; seat++) { scores[seat] = values[seat]; }
  return scores;
}

// Apply seeded scores onto a freshly-constructed Game session, deriving onBarrel
// from each score so the barrel marker and the barrel bid floor (FR-022) reflect
// the seed from round 1 — without this, onBarrel only flips at the first
// round-end re-evaluation. Returns true when a seed was applied, false when inert.
function applySeededScores(session) {
  const scores = seededScoresForTest(session.playerCount);
  if (!scores) { return false; }
  for (const seat in scores) {
    session.cumulativeScores[seat] = scores[seat];
    session.barrelState[seat].onBarrel = scores[seat] >= BARREL_MIN && scores[seat] < BARREL_MAX;
  }
  return true;
}

module.exports = { seededScoresForTest, applySeededScores };
