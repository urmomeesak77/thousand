'use strict';
/* global Antlion, ThousandApp */

// Pure DOM lookup utility — no state
const $ = (id) => document.getElementById(id);

const antlion = new Antlion();
new ThousandApp(antlion).init();
antlion.start();
