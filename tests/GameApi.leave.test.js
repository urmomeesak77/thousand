'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');

// ---------------------------------------------------------------------------
// GameApi.leave — 404 from the server is treated as success.
//
// Bug: pressing Escape mid-game (or after victory) and confirming Leave could
// surface a "Game or player not found" toast when the server had already
// cleaned up the membership (post-victory _cleanupRound, race after opponent's
// leave, etc.). The leave intent is satisfied either way — don't error.
// ---------------------------------------------------------------------------

let dom;
let GameApi;
let errors;
let onError;

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost',
  });
  loadModule(dom, 'network/GameApi.js');
  GameApi = dom.window.GameApi;
  errors = [];
  onError = (msg) => errors.push(msg);
});

afterEach(() => {
  dom.window.close();
});

function stubFetch(status, body = '') {
  dom.window.fetch = async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  });
}

describe('GameApi.leave — 404 is a successful no-op', () => {
  it('returns true on 200 OK', async () => {
    stubFetch(200, '{}');
    const api = new GameApi(onError);
    const ok = await api.leave('abc123');
    assert.equal(ok, true);
    assert.deepEqual(errors, []);
  });

  it('returns true on 404 without showing an error', async () => {
    stubFetch(404, 'Not Found');
    const api = new GameApi(onError);
    const ok = await api.leave('abc123');
    assert.equal(ok, true,
      'leave should resolve "successfully" when the server says you are already gone');
    assert.deepEqual(errors, [], 'no error toast must be shown for 404 from /leave');
  });

  it('surfaces an error for other failure statuses', async () => {
    stubFetch(500, JSON.stringify({ message: 'server error' }));
    const api = new GameApi(onError);
    const ok = await api.leave('abc123');
    assert.equal(ok, false);
    assert.equal(errors.length, 1);
  });

  it('returns true and skips the request when gameId is missing', async () => {
    let calledFetch = false;
    dom.window.fetch = async () => { calledFetch = true; return { ok: true, status: 200, text: async () => '' }; };
    const api = new GameApi(onError);
    const ok = await api.leave(null);
    assert.equal(ok, true);
    assert.equal(calledFetch, false, 'no HTTP request should be made when there is no gameId');
    assert.deepEqual(errors, []);
  });
});
