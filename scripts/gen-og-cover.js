'use strict';

// Generates src/public/gfx/og-cover.png — the 1200x630 social-share card.
// Pure Node (built-in zlib via png-canvas.js) so the asset is reproducible
// without a rasterizer. Run: `node scripts/gen-og-cover.js`. Placeholder
// brand cover (gradient + three fanned suit cards); replace with a designed
// export when one exists.

const fs = require('fs');
const path = require('path');
const { Canvas, RED, BLACK, CARD } = require('./png-canvas');

const W = 1200;
const H = 630;
const c = new Canvas(W, H);

c.background([0x0b, 0x14, 0x0e], [0x10, 0x24, 0x1a], [0x3e, 0xa8, 0x6c], 0.18);

const CW = 200;
const CH = 290;
const baseY = 330;
// three fanned cards: diamond (left), spade (centre, on top), heart (right)
c.fillRoundRect(W / 2 - 240, baseY + 30, CW, CH, 18, -0.22, CARD);
c.fillDiamond(W / 2 - 240, baseY + 30, 70, RED);

c.fillRoundRect(W / 2 + 240, baseY + 30, CW, CH, 18, 0.22, CARD);
c.heart(W / 2 + 240, baseY + 20, 50, RED);

c.fillRoundRect(W / 2, baseY, CW, CH, 18, 0, CARD);
c.spade(W / 2, baseY - 5, 50, BLACK);

const out = path.join(__dirname, '..', 'src', 'public', 'gfx', 'og-cover.png');
fs.writeFileSync(out, c.toPng());
console.log(`Wrote ${out}`);
