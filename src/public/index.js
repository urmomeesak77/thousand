'use strict';
/* global Antlion, LobbyApp */

// Pure DOM lookup utility — no state
const $ = (id) => document.getElementById(id);

const antlion = new Antlion();
new LobbyApp(antlion).init();
antlion.start();
