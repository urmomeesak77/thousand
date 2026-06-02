'use strict';

// Generates src/public/apple-touch-icon.png — the 180x180 iOS home-screen
// icon (iOS ignores SVG, so a raster is required). Run:
// `node scripts/gen-apple-touch-icon.js`. Solid background; iOS applies its
// own rounded-corner mask, so no transparency is used.

const fs = require('fs');
const path = require('path');
const { Canvas, RED, CARD } = require('./png-canvas');

const S = 180;
const c = new Canvas(S, S);

c.background([0x0b, 0x14, 0x0e], [0x10, 0x24, 0x1a], [0x3e, 0xa8, 0x6c], 0.3);

// two fanned cards with a heart, echoing favicon.svg
c.fillRoundRect(S / 2 - 18, S / 2, 70, 100, 10, -0.18, CARD);
c.fillRoundRect(S / 2 + 18, S / 2, 70, 100, 10, 0.18, CARD);
c.heart(S / 2 + 18, S / 2 - 8, 17, RED);

const out = path.join(__dirname, '..', 'src', 'public', 'apple-touch-icon.png');
fs.writeFileSync(out, c.toPng());
console.log(`Wrote ${out}`);
