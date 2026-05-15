'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Game = require('../src/services/Game');

describe('Game.constructor — initial state (T057)', () => {
  it('creates a Game with correct gameId, seatOrder, dealerSeat', () => {
    const game = new Game({
      gameId: 'game-1',
      seatOrder: ['p0', 'p1', 'p2'],
      dealerSeat: 0,
    });
    assert.equal(game.gameId, 'game-1');
    assert.deepEqual(game.seatOrder, ['p0', 'p1', 'p2']);
    assert.equal(game.dealerSeat, 0);
  });

  it('initializes currentRoundNumber to 1', () => {
    const game = new Game({
      gameId: 'game-1',
      seatOrder: ['p0', 'p1', 'p2'],
      dealerSeat: 0,
    });
    assert.equal(game.currentRoundNumber, 1);
  });

  it('initializes cumulativeScores with all seats at 0', () => {
    const game = new Game({
      gameId: 'game-1',
      seatOrder: ['p0', 'p1', 'p2'],
      dealerSeat: 0,
    });
    assert.deepEqual(game.cumulativeScores, { 0: 0, 1: 0, 2: 0 });
  });

  it('initializes barrelState with all seats having onBarrel=false, barrelRoundsUsed=0', () => {
    const game = new Game({
      gameId: 'game-1',
      seatOrder: ['p0', 'p1', 'p2'],
      dealerSeat: 0,
    });
    assert.deepEqual(game.barrelState, {
      0: { onBarrel: false, barrelRoundsUsed: 0 },
      1: { onBarrel: false, barrelRoundsUsed: 0 },
      2: { onBarrel: false, barrelRoundsUsed: 0 },
    });
  });

  it('initializes consecutiveZeros with all seats at 0', () => {
    const game = new Game({
      gameId: 'game-1',
      seatOrder: ['p0', 'p1', 'p2'],
      dealerSeat: 0,
    });
    assert.deepEqual(game.consecutiveZeros, { 0: 0, 1: 0, 2: 0 });
  });

  it('initializes continuePresses as an empty Set', () => {
    const game = new Game({
      gameId: 'game-1',
      seatOrder: ['p0', 'p1', 'p2'],
      dealerSeat: 0,
    });
    assert.ok(game.continuePresses instanceof Set);
    assert.equal(game.continuePresses.size, 0);
  });

  it('initializes history as an empty array', () => {
    const game = new Game({
      gameId: 'game-1',
      seatOrder: ['p0', 'p1', 'p2'],
      dealerSeat: 0,
    });
    assert.ok(Array.isArray(game.history));
    assert.equal(game.history.length, 0);
  });

  it('initializes gameStatus to "in-progress"', () => {
    const game = new Game({
      gameId: 'game-1',
      seatOrder: ['p0', 'p1', 'p2'],
      dealerSeat: 0,
    });
    assert.equal(game.gameStatus, 'in-progress');
  });
});

describe('Game.applyRoundEnd — single round (T057)', () => {
  it('mutates cumulativeScores by adding each delta to the corresponding seat', () => {
    const game = new Game({
      gameId: 'game-1',
      seatOrder: ['p0', 'p1', 'p2'],
      dealerSeat: 0,
    });
    const deltas = { 0: 100, 1: 20, 2: 0 };
    const summaryEntry = {
      roundNumber: 1,
      declarerSeat: 0,
      declarerNickname: 'Player0',
      bid: 100,
      perPlayer: {
        0: { trickPoints: 100, marriageBonus: 0, delta: 100, cumulativeAfter: 100, penalties: [] },
        1: { trickPoints: 20, marriageBonus: 0, delta: 20, cumulativeAfter: 20, penalties: [] },
        2: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
      },
    };

    const result = game.applyRoundEnd(deltas, summaryEntry);

    assert.equal(game.cumulativeScores[0], 100);
    assert.equal(game.cumulativeScores[1], 20);
    assert.equal(game.cumulativeScores[2], 0);
    assert.deepEqual(result, { 0: 100, 1: 20, 2: 0 });
  });

  it('appends the summaryEntry to history', () => {
    const game = new Game({
      gameId: 'game-1',
      seatOrder: ['p0', 'p1', 'p2'],
      dealerSeat: 0,
    });
    const deltas = { 0: 100, 1: 20, 2: 0 };
    const summaryEntry = {
      roundNumber: 1,
      declarerSeat: 0,
      declarerNickname: 'Player0',
      bid: 100,
      perPlayer: {
        0: { trickPoints: 100, marriageBonus: 0, delta: 100, cumulativeAfter: 100, penalties: [] },
        1: { trickPoints: 20, marriageBonus: 0, delta: 20, cumulativeAfter: 20, penalties: [] },
        2: { trickPoints: 0, marriageBonus: 0, delta: 0, cumulativeAfter: 0, penalties: [] },
      },
    };

    game.applyRoundEnd(deltas, summaryEntry);

    assert.equal(game.history.length, 1);
    assert.equal(game.history[0].roundNumber, 1);
    assert.deepEqual(game.history[0], summaryEntry);
  });

  it('returns the updated cumulativeScores', () => {
    const game = new Game({
      gameId: 'game-1',
      seatOrder: ['p0', 'p1', 'p2'],
      dealerSeat: 0,
    });
    const deltas = { 0: 150, 1: 50, 2: -50 };
    const summaryEntry = {
      roundNumber: 1,
      declarerSeat: 0,
      declarerNickname: 'Player0',
      bid: 100,
      perPlayer: {
        0: { trickPoints: 150, marriageBonus: 0, delta: 150, cumulativeAfter: 150, penalties: [] },
        1: { trickPoints: 50, marriageBonus: 0, delta: 50, cumulativeAfter: 50, penalties: [] },
        2: { trickPoints: 0, marriageBonus: 0, delta: -50, cumulativeAfter: -50, penalties: [] },
      },
    };

    const result = game.applyRoundEnd(deltas, summaryEntry);

    assert.deepEqual(result, { 0: 150, 1: 50, 2: -50 });
  });

  it('allows negative deltas resulting in negative cumulative scores', () => {
    const game = new Game({
      gameId: 'game-1',
      seatOrder: ['p0', 'p1', 'p2'],
      dealerSeat: 0,
    });
    const deltas = { 0: -100, 1: 50, 2: 50 };
    const summaryEntry = {
      roundNumber: 1,
      declarerSeat: 1,
      declarerNickname: 'Player1',
      bid: 100,
      perPlayer: {
        0: { trickPoints: 0, marriageBonus: 0, delta: -100, cumulativeAfter: -100, penalties: [] },
        1: { trickPoints: 50, marriageBonus: 0, delta: 50, cumulativeAfter: 50, penalties: [] },
        2: { trickPoints: 50, marriageBonus: 0, delta: 50, cumulativeAfter: 50, penalties: [] },
      },
    };

    game.applyRoundEnd(deltas, summaryEntry);

    assert.equal(game.cumulativeScores[0], -100);
    assert.ok(game.cumulativeScores[0] < 0);
  });
});

describe('Game.recordContinuePress (T057)', () => {
  it('adds a seat to continuePresses', () => {
    const game = new Game({
      gameId: 'game-1',
      seatOrder: ['p0', 'p1', 'p2'],
      dealerSeat: 0,
    });

    game.recordContinuePress(0);

    assert.ok(game.continuePresses.has(0));
    assert.equal(game.continuePresses.size, 1);
  });

  it('is idempotent: second call with same seat is a no-op', () => {
    const game = new Game({
      gameId: 'game-1',
      seatOrder: ['p0', 'p1', 'p2'],
      dealerSeat: 0,
    });

    game.recordContinuePress(0);
    game.recordContinuePress(0);

    assert.equal(game.continuePresses.size, 1);
  });

  it('allows multiple different seats', () => {
    const game = new Game({
      gameId: 'game-1',
      seatOrder: ['p0', 'p1', 'p2'],
      dealerSeat: 0,
    });

    game.recordContinuePress(0);
    game.recordContinuePress(1);
    game.recordContinuePress(2);

    assert.equal(game.continuePresses.size, 3);
    assert.ok(game.continuePresses.has(0));
    assert.ok(game.continuePresses.has(1));
    assert.ok(game.continuePresses.has(2));
  });

  it('short-circuits if gameStatus is not "in-progress"', () => {
    const game = new Game({
      gameId: 'game-1',
      seatOrder: ['p0', 'p1', 'p2'],
      dealerSeat: 0,
    });
    game.gameStatus = 'game-over';

    game.recordContinuePress(0);

    assert.equal(game.continuePresses.size, 0);
  });
});

describe('Game.startNextRound (T057)', () => {
  it('increments currentRoundNumber', () => {
    const game = new Game({
      gameId: 'game-1',
      seatOrder: ['p0', 'p1', 'p2'],
      dealerSeat: 0,
    });

    game.startNextRound();

    assert.equal(game.currentRoundNumber, 2);
  });

  it('rotates dealerSeat clockwise: (old + 1) % 3', () => {
    const game = new Game({
      gameId: 'game-1',
      seatOrder: ['p0', 'p1', 'p2'],
      dealerSeat: 0,
    });

    game.startNextRound();

    assert.equal(game.dealerSeat, 1);
  });

  it('wraps dealerSeat from 2 back to 0', () => {
    const game = new Game({
      gameId: 'game-1',
      seatOrder: ['p0', 'p1', 'p2'],
      dealerSeat: 2,
    });

    game.startNextRound();

    assert.equal(game.dealerSeat, 0);
  });

  it('clears continuePresses to an empty Set', () => {
    const game = new Game({
      gameId: 'game-1',
      seatOrder: ['p0', 'p1', 'p2'],
      dealerSeat: 0,
    });
    game.recordContinuePress(0);
    game.recordContinuePress(1);

    game.startNextRound();

    assert.ok(game.continuePresses instanceof Set);
    assert.equal(game.continuePresses.size, 0);
  });

  it('does NOT reset cumulativeScores (carry-over)', () => {
    const game = new Game({
      gameId: 'game-1',
      seatOrder: ['p0', 'p1', 'p2'],
      dealerSeat: 0,
    });
    const deltas = { 0: 100, 1: 20, 2: 30 };
    const summaryEntry = {
      roundNumber: 1,
      declarerSeat: 0,
      declarerNickname: 'Player0',
      bid: 100,
      perPlayer: {
        0: { trickPoints: 100, marriageBonus: 0, delta: 100, cumulativeAfter: 100, penalties: [] },
        1: { trickPoints: 20, marriageBonus: 0, delta: 20, cumulativeAfter: 20, penalties: [] },
        2: { trickPoints: 30, marriageBonus: 0, delta: 30, cumulativeAfter: 30, penalties: [] },
      },
    };

    game.applyRoundEnd(deltas, summaryEntry);
    game.startNextRound();

    assert.deepEqual(game.cumulativeScores, { 0: 100, 1: 20, 2: 30 });
  });
});

describe('Game multiround simulation — FR-016, FR-029, R-002, R-007 (T057)', () => {
  it('R-002: same Game instance across 3 rounds (not recreated)', () => {
    // Create a game and apply 3 rounds without creating a new Game.
    const game = new Game({
      gameId: 'game-1',
      seatOrder: ['p0', 'p1', 'p2'],
      dealerSeat: 0,
    });
    const gameRef = game; // Keep a reference to the original instance

    // Round 1
    const deltas1 = { 0: 100, 1: 20, 2: 50 };
    const summary1 = {
      roundNumber: 1,
      declarerSeat: 0,
      declarerNickname: 'Player0',
      bid: 100,
      perPlayer: {
        0: { trickPoints: 100, marriageBonus: 0, delta: 100, cumulativeAfter: 100, penalties: [] },
        1: { trickPoints: 20, marriageBonus: 0, delta: 20, cumulativeAfter: 20, penalties: [] },
        2: { trickPoints: 50, marriageBonus: 0, delta: 50, cumulativeAfter: 50, penalties: [] },
      },
    };
    game.applyRoundEnd(deltas1, summary1);
    game.startNextRound();

    // Assertion 1: same instance after round 1
    assert.strictEqual(game, gameRef, 'Game instance must remain the same after round 1');

    // Round 2
    const deltas2 = { 0: -50, 1: 150, 2: 30 };
    const summary2 = {
      roundNumber: 2,
      declarerSeat: 1,
      declarerNickname: 'Player1',
      bid: 120,
      perPlayer: {
        0: { trickPoints: 0, marriageBonus: 0, delta: -50, cumulativeAfter: 50, penalties: [] },
        1: { trickPoints: 150, marriageBonus: 0, delta: 150, cumulativeAfter: 170, penalties: [] },
        2: { trickPoints: 30, marriageBonus: 0, delta: 30, cumulativeAfter: 80, penalties: [] },
      },
    };
    game.applyRoundEnd(deltas2, summary2);
    game.startNextRound();

    // Assertion 2: same instance after round 2
    assert.strictEqual(game, gameRef, 'Game instance must remain the same after round 2');

    // Round 3
    const deltas3 = { 0: 80, 1: -40, 2: 100 };
    const summary3 = {
      roundNumber: 3,
      declarerSeat: 2,
      declarerNickname: 'Player2',
      bid: 150,
      perPlayer: {
        0: { trickPoints: 80, marriageBonus: 0, delta: 80, cumulativeAfter: 130, penalties: [] },
        1: { trickPoints: 0, marriageBonus: 0, delta: -40, cumulativeAfter: 130, penalties: [] },
        2: { trickPoints: 100, marriageBonus: 0, delta: 100, cumulativeAfter: 180, penalties: [] },
      },
    };
    game.applyRoundEnd(deltas3, summary3);

    // Assertion 3: same instance after round 3
    assert.strictEqual(game, gameRef, 'Game instance must remain the same after round 3');

    // Assertion 4: cumulativeScores equals sum of all 3 rounds' deltas
    const expectedCumulative = {
      0: 100 + (-50) + 80, // 130
      1: 20 + 150 + (-40), // 130
      2: 50 + 30 + 100, // 180
    };
    assert.deepEqual(game.cumulativeScores, expectedCumulative);
  });

  it('R-007: no purge on play_phase_ready path — game record survives round boundaries', () => {
    // Simulate a game flowing through 3 rounds with no interruption.
    // The game record should remain intact (gameStatus stays 'in-progress', game is not purged).
    const game = new Game({
      gameId: 'game-1',
      seatOrder: ['p0', 'p1', 'p2'],
      dealerSeat: 0,
    });

    // Round 1
    const deltas1 = { 0: 50, 1: 50, 2: 50 };
    const summary1 = {
      roundNumber: 1,
      declarerSeat: 0,
      declarerNickname: 'Player0',
      bid: 100,
      perPlayer: {
        0: { trickPoints: 50, marriageBonus: 0, delta: 50, cumulativeAfter: 50, penalties: [] },
        1: { trickPoints: 50, marriageBonus: 0, delta: 50, cumulativeAfter: 50, penalties: [] },
        2: { trickPoints: 50, marriageBonus: 0, delta: 50, cumulativeAfter: 50, penalties: [] },
      },
    };
    game.applyRoundEnd(deltas1, summary1);
    assert.equal(game.gameStatus, 'in-progress', 'after round 1 end');
    game.startNextRound();
    assert.equal(game.gameStatus, 'in-progress', 'after round 1 startNextRound');

    // Round 2
    const deltas2 = { 0: 60, 1: 40, 2: 80 };
    const summary2 = {
      roundNumber: 2,
      declarerSeat: 1,
      declarerNickname: 'Player1',
      bid: 110,
      perPlayer: {
        0: { trickPoints: 60, marriageBonus: 0, delta: 60, cumulativeAfter: 110, penalties: [] },
        1: { trickPoints: 40, marriageBonus: 0, delta: 40, cumulativeAfter: 90, penalties: [] },
        2: { trickPoints: 80, marriageBonus: 0, delta: 80, cumulativeAfter: 130, penalties: [] },
      },
    };
    game.applyRoundEnd(deltas2, summary2);
    assert.equal(game.gameStatus, 'in-progress', 'after round 2 end');
    game.startNextRound();
    assert.equal(game.gameStatus, 'in-progress', 'after round 2 startNextRound');

    // Round 3
    const deltas3 = { 0: 55, 1: 75, 2: 45 };
    const summary3 = {
      roundNumber: 3,
      declarerSeat: 2,
      declarerNickname: 'Player2',
      bid: 130,
      perPlayer: {
        0: { trickPoints: 55, marriageBonus: 0, delta: 55, cumulativeAfter: 165, penalties: [] },
        1: { trickPoints: 75, marriageBonus: 0, delta: 75, cumulativeAfter: 165, penalties: [] },
        2: { trickPoints: 45, marriageBonus: 0, delta: 45, cumulativeAfter: 175, penalties: [] },
      },
    };
    game.applyRoundEnd(deltas3, summary3);
    assert.equal(game.gameStatus, 'in-progress', 'after round 3 end');

    // Verify game record survives
    assert.ok(game, 'game record still exists');
    assert.equal(game.gameId, 'game-1', 'gameId preserved');
    assert.deepEqual(game.seatOrder, ['p0', 'p1', 'p2'], 'seatOrder preserved');
    assert.equal(game.currentRoundNumber, 3, 'currentRoundNumber correctly at round 3');
    assert.equal(game.history.length, 3, 'history contains all 3 rounds');
  });

  it('dealer rotates correctly across 3 rounds: 0 → 1 → 2 → 0', () => {
    const game = new Game({
      gameId: 'game-1',
      seatOrder: ['p0', 'p1', 'p2'],
      dealerSeat: 0,
    });

    assert.equal(game.dealerSeat, 0, 'round 1 starts with dealer = 0');

    const deltas1 = { 0: 50, 1: 50, 2: 50 };
    const summary1 = {
      roundNumber: 1,
      declarerSeat: 0,
      declarerNickname: 'Player0',
      bid: 100,
      perPlayer: {
        0: { trickPoints: 50, marriageBonus: 0, delta: 50, cumulativeAfter: 50, penalties: [] },
        1: { trickPoints: 50, marriageBonus: 0, delta: 50, cumulativeAfter: 50, penalties: [] },
        2: { trickPoints: 50, marriageBonus: 0, delta: 50, cumulativeAfter: 50, penalties: [] },
      },
    };
    game.applyRoundEnd(deltas1, summary1);
    game.startNextRound();

    assert.equal(game.dealerSeat, 1, 'after round 1: dealer rotates to 1');

    const deltas2 = { 0: 60, 1: 40, 2: 80 };
    const summary2 = {
      roundNumber: 2,
      declarerSeat: 1,
      declarerNickname: 'Player1',
      bid: 110,
      perPlayer: {
        0: { trickPoints: 60, marriageBonus: 0, delta: 60, cumulativeAfter: 110, penalties: [] },
        1: { trickPoints: 40, marriageBonus: 0, delta: 40, cumulativeAfter: 90, penalties: [] },
        2: { trickPoints: 80, marriageBonus: 0, delta: 80, cumulativeAfter: 130, penalties: [] },
      },
    };
    game.applyRoundEnd(deltas2, summary2);
    game.startNextRound();

    assert.equal(game.dealerSeat, 2, 'after round 2: dealer rotates to 2');

    const deltas3 = { 0: 55, 1: 75, 2: 45 };
    const summary3 = {
      roundNumber: 3,
      declarerSeat: 2,
      declarerNickname: 'Player2',
      bid: 130,
      perPlayer: {
        0: { trickPoints: 55, marriageBonus: 0, delta: 55, cumulativeAfter: 165, penalties: [] },
        1: { trickPoints: 75, marriageBonus: 0, delta: 75, cumulativeAfter: 165, penalties: [] },
        2: { trickPoints: 45, marriageBonus: 0, delta: 45, cumulativeAfter: 175, penalties: [] },
      },
    };
    game.applyRoundEnd(deltas3, summary3);
    game.startNextRound();

    assert.equal(game.dealerSeat, 0, 'after round 3: dealer wraps back to 0');
  });

  it('cumulative carry-over with negative deltas: 100 → -50 → 30', () => {
    const game = new Game({
      gameId: 'game-1',
      seatOrder: ['p0', 'p1', 'p2'],
      dealerSeat: 0,
    });

    // Round 1: seat 0 gets +100
    const deltas1 = { 0: 100, 1: 10, 2: 10 };
    const summary1 = {
      roundNumber: 1,
      declarerSeat: 0,
      declarerNickname: 'Player0',
      bid: 100,
      perPlayer: {
        0: { trickPoints: 100, marriageBonus: 0, delta: 100, cumulativeAfter: 100, penalties: [] },
        1: { trickPoints: 10, marriageBonus: 0, delta: 10, cumulativeAfter: 10, penalties: [] },
        2: { trickPoints: 10, marriageBonus: 0, delta: 10, cumulativeAfter: 10, penalties: [] },
      },
    };
    game.applyRoundEnd(deltas1, summary1);
    assert.equal(game.cumulativeScores[0], 100, 'after round 1: seat 0 = 100');
    game.startNextRound();

    // Round 2: seat 0 gets -150 → cumulative becomes -50
    const deltas2 = { 0: -150, 1: 80, 2: 70 };
    const summary2 = {
      roundNumber: 2,
      declarerSeat: 1,
      declarerNickname: 'Player1',
      bid: 120,
      perPlayer: {
        0: { trickPoints: 0, marriageBonus: 0, delta: -150, cumulativeAfter: -50, penalties: [] },
        1: { trickPoints: 80, marriageBonus: 0, delta: 80, cumulativeAfter: 90, penalties: [] },
        2: { trickPoints: 70, marriageBonus: 0, delta: 70, cumulativeAfter: 80, penalties: [] },
      },
    };
    game.applyRoundEnd(deltas2, summary2);
    assert.equal(game.cumulativeScores[0], -50, 'after round 2: seat 0 = 100 + (-150) = -50');
    game.startNextRound();

    // Round 3: seat 0 gets +80 → cumulative becomes 30
    const deltas3 = { 0: 80, 1: 50, 2: 60 };
    const summary3 = {
      roundNumber: 3,
      declarerSeat: 2,
      declarerNickname: 'Player2',
      bid: 130,
      perPlayer: {
        0: { trickPoints: 80, marriageBonus: 0, delta: 80, cumulativeAfter: 30, penalties: [] },
        1: { trickPoints: 50, marriageBonus: 0, delta: 50, cumulativeAfter: 140, penalties: [] },
        2: { trickPoints: 60, marriageBonus: 0, delta: 60, cumulativeAfter: 140, penalties: [] },
      },
    };
    game.applyRoundEnd(deltas3, summary3);
    assert.equal(game.cumulativeScores[0], 30, 'after round 3: seat 0 = -50 + 80 = 30');
  });

  it('history accumulates across rounds with game object unchanged', () => {
    const game = new Game({
      gameId: 'game-1',
      seatOrder: ['p0', 'p1', 'p2'],
      dealerSeat: 0,
    });

    const deltas1 = { 0: 100, 1: 20, 2: 50 };
    const summary1 = {
      roundNumber: 1,
      declarerSeat: 0,
      declarerNickname: 'Player0',
      bid: 100,
      perPlayer: {
        0: { trickPoints: 100, marriageBonus: 0, delta: 100, cumulativeAfter: 100, penalties: [] },
        1: { trickPoints: 20, marriageBonus: 0, delta: 20, cumulativeAfter: 20, penalties: [] },
        2: { trickPoints: 50, marriageBonus: 0, delta: 50, cumulativeAfter: 50, penalties: [] },
      },
    };
    game.applyRoundEnd(deltas1, summary1);
    assert.equal(game.history.length, 1);
    game.startNextRound();

    const deltas2 = { 0: -50, 1: 150, 2: 30 };
    const summary2 = {
      roundNumber: 2,
      declarerSeat: 1,
      declarerNickname: 'Player1',
      bid: 120,
      perPlayer: {
        0: { trickPoints: 0, marriageBonus: 0, delta: -50, cumulativeAfter: 50, penalties: [] },
        1: { trickPoints: 150, marriageBonus: 0, delta: 150, cumulativeAfter: 170, penalties: [] },
        2: { trickPoints: 30, marriageBonus: 0, delta: 30, cumulativeAfter: 80, penalties: [] },
      },
    };
    game.applyRoundEnd(deltas2, summary2);
    assert.equal(game.history.length, 2);
    game.startNextRound();

    const deltas3 = { 0: 80, 1: -40, 2: 100 };
    const summary3 = {
      roundNumber: 3,
      declarerSeat: 2,
      declarerNickname: 'Player2',
      bid: 150,
      perPlayer: {
        0: { trickPoints: 80, marriageBonus: 0, delta: 80, cumulativeAfter: 130, penalties: [] },
        1: { trickPoints: 0, marriageBonus: 0, delta: -40, cumulativeAfter: 130, penalties: [] },
        2: { trickPoints: 100, marriageBonus: 0, delta: 100, cumulativeAfter: 180, penalties: [] },
      },
    };
    game.applyRoundEnd(deltas3, summary3);
    assert.equal(game.history.length, 3);

    // Verify all summaries are in history with correct roundNumbers
    assert.equal(game.history[0].roundNumber, 1);
    assert.equal(game.history[1].roundNumber, 2);
    assert.equal(game.history[2].roundNumber, 3);
  });
});
