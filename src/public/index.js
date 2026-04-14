'use strict';
/* global LobbyApp */

// Pure DOM lookup utility — no state
const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', () => new LobbyApp().init());
