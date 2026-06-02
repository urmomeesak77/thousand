/**
 * Live 3-browser end-game / barrel e2e test.
 *
 * Runs two scenarios (see tests/endgameHarness.js), each seeding cumulative
 * scores via THOUSAND_SEED_SCORES so the victory and barrel paths are reached
 * in a round or two:
 *   1. all three players start at 700 → play to victory (game ending).
 *   2. seat 0 seeded on the barrel (900) → assert the barrel marker, play on.
 *
 * Usage:  node tests/e2e-endgame.js          (headless; faster)
 *         E2E_HEADLESS=false node tests/e2e-endgame.js   (watch the browsers)
 */

'use strict';

const { runEndgameSuite } = require('./endgameHarness');

runEndgameSuite(3).catch((err) => {
  console.error('\n❌ Test error:', err.message);
  process.exit(1);
});
