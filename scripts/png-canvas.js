'use strict';

// Minimal dependency-free RGBA canvas + PNG encoder shared by the asset
// generators (gen-og-cover.js, gen-apple-touch-icon.js). Pure Node so the
// brand assets stay reproducible without a rasterizer.

const zlib = require('zlib');

const RED = [0xc7, 0x2c, 0x41];
const BLACK = [0x1a, 0x1a, 0x1a];
const CARD = [0xf0, 0xed, 0xe8];

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function lerp(a, b, t) { return a + (b - a) * t; }

class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.buf = Buffer.alloc(w * h * 4);
  }

  setPx(x, y, r, g, b, a) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const sa = a / 255;
    const da = 1 - sa;
    this.buf[i] = Math.round(r * sa + this.buf[i] * da);
    this.buf[i + 1] = Math.round(g * sa + this.buf[i + 1] * da);
    this.buf[i + 2] = Math.round(b * sa + this.buf[i + 2] * da);
    this.buf[i + 3] = 255;
  }

  // Vertical gradient (top→bottom) plus a soft radial glow toward the centre.
  background(topCol, botCol, glowCol, glowStrength) {
    for (let y = 0; y < this.h; y++) {
      const t = y / this.h;
      const r0 = lerp(topCol[0], botCol[0], t);
      const g0 = lerp(topCol[1], botCol[1], t);
      const b0 = lerp(topCol[2], botCol[2], t);
      for (let x = 0; x < this.w; x++) {
        const dx = (x - this.w / 2) / (this.w / 2);
        const dy = (y - this.h / 2) / (this.h / 2);
        const glow = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy)) * glowStrength;
        this.setPx(x, y,
          r0 + (glowCol[0] - r0) * glow,
          g0 + (glowCol[1] - g0) * glow,
          b0 + (glowCol[2] - b0) * glow, 255);
      }
    }
  }

  fillRoundRect(cx, cy, w, h, rad, rot, col) {
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const reach = Math.ceil(Math.max(w, h));
    for (let oy = -reach; oy <= reach; oy++) {
      for (let ox = -reach; ox <= reach; ox++) {
        const lx = ox * cos + oy * sin;
        const ly = -ox * sin + oy * cos;
        const ax = Math.abs(lx);
        const ay = Math.abs(ly);
        if (ax > w / 2 || ay > h / 2) continue;
        const qx = ax - (w / 2 - rad);
        const qy = ay - (h / 2 - rad);
        if (qx > 0 && qy > 0 && qx * qx + qy * qy > rad * rad) continue;
        this.setPx(cx + ox, cy + oy, col[0], col[1], col[2], 255);
      }
    }
  }

  fillCircle(cx, cy, r, col) {
    for (let oy = -r; oy <= r; oy++) {
      for (let ox = -r; ox <= r; ox++) {
        if (ox * ox + oy * oy <= r * r) this.setPx(cx + ox, cy + oy, col[0], col[1], col[2], 255);
      }
    }
  }

  fillDiamond(cx, cy, r, col) {
    for (let oy = -r; oy <= r; oy++) {
      for (let ox = -r; ox <= r; ox++) {
        if (Math.abs(ox) + Math.abs(oy) <= r) this.setPx(cx + ox, cy + oy, col[0], col[1], col[2], 255);
      }
    }
  }

  fillTriangleDown(cx, topY, half, height, col) {
    for (let dy = 0; dy <= height; dy++) {
      const span = Math.round(half * (1 - dy / height));
      for (let dx = -span; dx <= span; dx++) this.setPx(cx + dx, topY + dy, col[0], col[1], col[2], 255);
    }
  }

  fillTriangleUp(cx, baseY, half, height, col) {
    for (let dy = 0; dy <= height; dy++) {
      const span = Math.round(half * (dy / height));
      for (let dx = -span; dx <= span; dx++) this.setPx(cx + dx, baseY - dy, col[0], col[1], col[2], 255);
    }
  }

  heart(cx, cy, s, col) {
    this.fillCircle(cx - s * 0.5, cy - s * 0.35, s * 0.55, col);
    this.fillCircle(cx + s * 0.5, cy - s * 0.35, s * 0.55, col);
    this.fillTriangleDown(cx, Math.round(cy - s * 0.4), Math.round(s * 1.05), Math.round(s * 1.35), col);
  }

  spade(cx, cy, s, col) {
    this.fillCircle(cx - s * 0.5, cy + s * 0.25, s * 0.55, col);
    this.fillCircle(cx + s * 0.5, cy + s * 0.25, s * 0.55, col);
    this.fillTriangleUp(cx, Math.round(cy + s * 0.3), Math.round(s * 1.05), Math.round(s * 1.4), col);
    this.fillRoundRect(cx, Math.round(cy + s * 0.85), Math.round(s * 0.5), Math.round(s * 0.55), 2, 0, col);
  }

  toPng() {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0);
    ihdr.writeUInt32BE(this.h, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const stride = this.w * 4 + 1;
    const raw = Buffer.alloc(stride * this.h);
    for (let y = 0; y < this.h; y++) {
      raw[y * stride] = 0;
      this.buf.copy(raw, y * stride + 1, y * this.w * 4, (y + 1) * this.w * 4);
    }
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

module.exports = { Canvas, RED, BLACK, CARD };
