'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');

let dom;

// Fake antlion that captures named input handlers so the test can fire the
// sound:* events synchronously (mirrors the RulesModal test harness).
function makeFakeAntlion() {
  const handlers = {};
  return {
    handlers,
    onInput(type, fn) { handlers[type] = fn; },
    emit(type) { if (handlers[type]) { handlers[type](); } },
  };
}

// An audio factory whose bases record every clone-and-play so a test can assert
// exactly how many cues were actually played. `throwOnPlay` simulates a blocked
// autoplay / missing decoder.
function makeAudioFactory({ throwOnPlay = false } = {}) {
  const bases = {};
  const factory = (src) => {
    const clones = [];
    const base = {
      src,
      clones,
      cloneNode() {
        const clone = {
          played: 0,
          play() {
            this.played += 1;
            if (throwOnPlay) { throw new Error('NotAllowedError'); }
          },
        };
        clones.push(clone);
        return clone;
      },
    };
    bases[src] = base;
    return base;
  };
  factory.bases = bases;
  factory.totalPlays = () =>
    Object.values(bases).reduce(
      (sum, b) => sum + b.clones.reduce((s, c) => s + c.played, 0),
      0,
    );
  return factory;
}

function make({ throwOnPlay = false } = {}) {
  const antlion = makeFakeAntlion();
  const audioFactory = makeAudioFactory({ throwOnPlay });
  const mgr = new dom.window.SoundManager(antlion, { audioFactory });
  return { antlion, audioFactory, mgr };
}

beforeEach(() => {
  dom = new JSDOM('<html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost',
  });
  loadModule(dom, 'thousand/SoundManager.js');
});

describe('SoundManager', () => {
  it('defaults to unmuted when no store is provided', () => {
    const { mgr } = make();
    assert.equal(mgr.isMuted(), false);
  });

  it('plays exactly once per play(cue) when unmuted', () => {
    const { mgr, audioFactory } = make();
    mgr.play('card');
    assert.equal(audioFactory.totalPlays(), 1);
  });

  it('plays via the matching engine event (sound:card → card cue)', () => {
    const { antlion, audioFactory } = make();
    antlion.emit('sound:card');
    antlion.emit('sound:flip');
    antlion.emit('sound:turn');
    assert.equal(audioFactory.totalPlays(), 3);
  });

  it('plays the wakeup cue via sound:wakeup', () => {
    const { antlion, audioFactory } = make();
    antlion.emit('sound:wakeup');
    assert.equal(audioFactory.totalPlays(), 1);
  });

  it('does not play wakeup when muted', () => {
    const { mgr, antlion, audioFactory } = make();
    mgr.toggleMute();
    antlion.emit('sound:wakeup');
    assert.equal(audioFactory.totalPlays(), 0);
  });

  it('does not play when muted', () => {
    const { mgr, audioFactory } = make();
    mgr.toggleMute();
    mgr.play('card');
    assert.equal(audioFactory.totalPlays(), 0);
  });

  it('treats an unknown cue as a no-op', () => {
    const { mgr, audioFactory } = make();
    assert.doesNotThrow(() => mgr.play('bogus'));
    assert.equal(audioFactory.totalPlays(), 0);
  });

  it('toggleMute() flips the state and returns the new value', () => {
    const { mgr } = make();
    assert.equal(mgr.toggleMute(), true);
    assert.equal(mgr.isMuted(), true);
    assert.equal(mgr.toggleMute(), false);
    assert.equal(mgr.isMuted(), false);
  });

  it('swallows errors thrown by play()', () => {
    const { mgr } = make({ throwOnPlay: true });
    assert.doesNotThrow(() => mgr.play('card'));
  });

  it('starts muted when the store reports a remembered mute preference', () => {
    const antlion = makeFakeAntlion();
    const store = { get: () => true, set() {} };
    const mgr = new dom.window.SoundManager(antlion, {
      store,
      audioFactory: makeAudioFactory(),
    });
    assert.equal(mgr.isMuted(), true);
  });

  it('persists the new value via store.set() on toggleMute()', () => {
    const antlion = makeFakeAntlion();
    const writes = [];
    const store = { get: () => false, set: (v) => writes.push(v) };
    const mgr = new dom.window.SoundManager(antlion, {
      store,
      audioFactory: makeAudioFactory(),
    });
    mgr.toggleMute();
    assert.deepEqual(writes, [true]);
    mgr.toggleMute();
    assert.deepEqual(writes, [true, false]);
  });
});
