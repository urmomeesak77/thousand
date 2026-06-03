'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');

// ---------------------------------------------------------------------------
// GameApi.logout — POSTs to /api/logout so the server purges the player (and
// frees the nickname) before the client clears identity and reloads. It is
// best-effort: a failed request must not throw or block logout.
// ---------------------------------------------------------------------------

let dom;
let GameApi;

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost',
  });
  dom.window.BASE_PATH = ''; // root deploy — no subpath prefix
  loadModule(dom, 'network/GameApi.js');
  GameApi = dom.window.GameApi;
});

afterEach(() => {
  dom.window.close();
});

describe('GameApi.logout', () => {
  it('POSTs to /api/logout with the bearer session token', async () => {
    const calls = [];
    dom.window.fetch = async (url, opts) => {
      calls.push({ url, opts });
      return { ok: true, status: 200, text: async () => '{"ok":true}' };
    };
    const api = new GameApi(() => {});
    api.setSessionToken('tok-123');

    await api.logout();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/logout');
    assert.equal(calls[0].opts.method, 'POST');
    assert.equal(calls[0].opts.headers['Authorization'], 'Bearer tok-123');
  });

  it('resolves without throwing when the request fails', async () => {
    dom.window.fetch = async () => { throw new Error('network down'); };
    const api = new GameApi(() => {});

    await assert.doesNotReject(() => api.logout());
  });
});
