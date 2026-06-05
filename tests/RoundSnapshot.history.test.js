'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ThousandStore = require('../src/services/ThousandStore');
const RoundSnapshot = require('../src/services/RoundSnapshot');

// Build a started 3-player game and return its round + session.
function startedGame() {
  const store = new ThousandStore();
  const pids = ['p0', 'p1', 'p2'];
  pids.forEach((pid, i) => {
    store.players.set(pid, { id: pid, nickname: ['A', 'B', 'C'][i], gameId: 'g' });
  });
  store.games.set('g', {
    id: 'g', players: new Set(pids), hostId: 'p0', type: 'public',
    status: 'waiting', requiredPlayers: 3, createdAt: Date.now(),
    inviteCode: null, round: null, waitingRoomTimer: null,
  });
  store.startRound('g');
  const game = store.games.get('g');
  return { round: game.round, session: game.session };
}

describe('RoundSnapshot includes actionHistory (FR-018)', () => {
  it('buildViewModel exposes actionHistory equal to the session log', () => {
    const { round, session } = startedGame();
    session.actionHistory.recordBid(1, 100, 1);
    session.actionHistory.recordPass(2, 1);
    const vm = RoundSnapshot.buildViewModel(round, 0);
    assert.deepEqual(vm.actionHistory, session.actionHistory.toView());
  });

  it('actionHistory is identical for every seat (public information)', () => {
    const { round, session } = startedGame();
    session.actionHistory.recordBid(1, 110, 1);
    session.actionHistory.recordTrick(0, 1, 1);
    const v0 = RoundSnapshot.buildViewModel(round, 0).actionHistory;
    const v1 = RoundSnapshot.buildViewModel(round, 1).actionHistory;
    const v2 = RoundSnapshot.buildViewModel(round, 2).actionHistory;
    assert.deepEqual(v0, v1);
    assert.deepEqual(v1, v2);
  });

  it('defaults to [] when the round has no session/history', () => {
    const { round } = startedGame();
    round._game = null; // simulate a round detached from its game/session
    const vm = RoundSnapshot.buildViewModel(round, 0);
    assert.deepEqual(vm.actionHistory, []);
  });
});
