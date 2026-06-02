/**
 * Live 4-browser end-game / barrel e2e test (4-player variant, feature 008).
 *
 * Same two scenarios as the 3-player version (tests/e2e-endgame.js), driven
 * through the shared harness with playerCount = 4:
 *   1. all four players start at 700 → play to victory (game ending).
 *   2. seat 0 seeded on the barrel (900) → assert the barrel marker, play on.
 *
 * Usage:  node tests/e2e-endgame-4p.js
 *         E2E_HEADLESS=false node tests/e2e-endgame-4p.js   (watch the browsers)
 */

'use strict';

const { runEndgameSuite } = require('./endgameHarness');

runEndgameSuite(4).catch((err) => {
  console.error('\n❌ Test error:', err.message);
  process.exit(1);
});
