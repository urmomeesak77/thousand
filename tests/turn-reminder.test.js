'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');

let dom;

// Fake antlion that records emits and lets the test fire armed intervals by hand
// (no real timers), so the 30s reminder logic is verified synchronously.
function makeFakeAntlion() {
  const emitted = [];
  const intervals = new Map();
  let nextId = 1;
  return {
    emitted,
    intervals,
    emit(type) { emitted.push(type); },
    scheduleInterval(delay, cb) {
      const id = nextId++;
      intervals.set(id, { delay, cb });
      return id;
    },
    cancelInterval(id) { intervals.delete(id); },
    fire(id) { intervals.get(id).cb(); },
  };
}

function make() {
  const antlion = makeFakeAntlion();
  const reminder = new dom.window.TurnReminder(antlion);
  return { antlion, reminder };
}

beforeEach(() => {
  dom = new JSDOM('<html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost',
  });
  loadModule(dom, 'thousand/TurnReminder.js');
});

describe('TurnReminder', () => {
  it('arms a 30s interval on the inactive→active edge', () => {
    const { antlion, reminder } = make();
    reminder.update(true);
    assert.equal(antlion.intervals.size, 1);
    const [{ delay }] = antlion.intervals.values();
    assert.equal(delay, 30000);
  });

  it('emits sound:wakeup each time the interval fires', () => {
    const { antlion, reminder } = make();
    reminder.update(true);
    const [id] = antlion.intervals.keys();
    antlion.fire(id);
    antlion.fire(id);
    assert.deepEqual(antlion.emitted, ['sound:wakeup', 'sound:wakeup']);
  });

  it('does not double-arm when update(true) is called while already active', () => {
    const { antlion, reminder } = make();
    reminder.update(true);
    reminder.update(true);
    assert.equal(antlion.intervals.size, 1);
  });

  it('disarms on the active→inactive edge', () => {
    const { antlion, reminder } = make();
    reminder.update(true);
    reminder.update(false);
    assert.equal(antlion.intervals.size, 0);
  });

  it('is a no-op when update(false) is called while already disarmed', () => {
    const { antlion, reminder } = make();
    assert.doesNotThrow(() => reminder.update(false));
    assert.equal(antlion.intervals.size, 0);
  });

  it('re-arms after a disarm (turn comes back around)', () => {
    const { antlion, reminder } = make();
    reminder.update(true);
    reminder.update(false);
    reminder.update(true);
    assert.equal(antlion.intervals.size, 1);
  });

  it('stop() cancels a pending interval', () => {
    const { antlion, reminder } = make();
    reminder.update(true);
    reminder.stop();
    assert.equal(antlion.intervals.size, 0);
  });
});
