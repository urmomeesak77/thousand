'use strict';

// Themed pool of computer-opponent names (FR-013). Picked uniquely per table so
// multiple bots at one table stay individually distinguishable.
const BOT_NAMES = [
  'Robo-Ada',
  'Robo-Max',
  'Robo-Vera',
  'Robo-Leo',
  'Robo-Iris',
  'Robo-Otto',
  'Robo-Nina',
  'Robo-Hugo',
];

// Returns a themed name not present in `usedNames`. Falls back to a numbered
// name if the curated pool is exhausted (more bots than names — never happens
// for a 3/4-seat table, but keeps the picker total).
function pickBotName(usedNames = []) {
  const used = new Set(usedNames);
  const free = BOT_NAMES.find((name) => !used.has(name));
  if (free) {return free;}
  let i = 1;
  while (used.has(`Robo-${i}`)) {i += 1;}
  return `Robo-${i}`;
}

module.exports = { BOT_NAMES, pickBotName };
