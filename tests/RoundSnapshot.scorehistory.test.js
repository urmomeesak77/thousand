'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const RoundSnapshot = require('../src/services/RoundSnapshot');

describe('RoundSnapshot.compactScoreHistory', () => {
  it('maps each history entry to roundNumber + per-seat delta/cumulativeAfter only', () => {
    const session = {
      history: [
        {
          roundNumber: 1,
          declarerNickname: 'Alice',
          bid: 120,
          perPlayer: {
            0: { delta: 120, cumulativeAfter: 120, trickPoints: 60, marriageBonus: 60, penalties: [] },
            1: { delta: 30, cumulativeAfter: 30, trickPoints: 30, marriageBonus: 0, penalties: [] },
            2: { delta: 30, cumulativeAfter: 30, trickPoints: 30, marriageBonus: 0, penalties: [] },
          },
        },
        {
          roundNumber: 2,
          declarerNickname: 'Bob',
          bid: 100,
          perPlayer: {
            0: { delta: 40, cumulativeAfter: 160, trickPoints: 40, marriageBonus: 0, penalties: [] },
            1: { delta: 50, cumulativeAfter: 80, trickPoints: 50, marriageBonus: 0, penalties: [] },
            2: { delta: 30, cumulativeAfter: 60, trickPoints: 30, marriageBonus: 0, penalties: [] },
          },
        },
      ],
    };

    assert.deepEqual(RoundSnapshot.compactScoreHistory(session), [
      { roundNumber: 1, perPlayer: { 0: { delta: 120, cumulativeAfter: 120 }, 1: { delta: 30, cumulativeAfter: 30 }, 2: { delta: 30, cumulativeAfter: 30 } } },
      { roundNumber: 2, perPlayer: { 0: { delta: 40, cumulativeAfter: 160 }, 1: { delta: 50, cumulativeAfter: 80 }, 2: { delta: 30, cumulativeAfter: 60 } } },
    ]);
  });

  it('returns [] for a null session', () => {
    assert.deepEqual(RoundSnapshot.compactScoreHistory(null), []);
  });

  it('returns [] for a session with empty history', () => {
    assert.deepEqual(RoundSnapshot.compactScoreHistory({ history: [] }), []);
  });
});
