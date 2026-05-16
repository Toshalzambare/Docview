/**
 * generate-icons.js
 *
 * Generates PNG icon files for the DocView Expo app using pure Node.js
 * (no external dependencies). Implements a minimal PNG encoder with
 * deflate compression via Node's built-in zlib module.
 *
 * Icons produced:
 *   assets/icon.png           1024x1024  Main app icon (dark bg + doc shape + "DV")
 *   assets/adaptive-icon.png  1024x1024  Android adaptive foreground (transparent bg)
 *   assets/splash-icon.png     200x200   Splash screen icon
 *   assets/favicon.png          48x48   Web favicon
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

const BG_COLOR      = hexToRgb('#0D0D0D'); // near-black background
const BLUE          = hexToRgb('#4A9EFF'); // electric blue
const WHITE         = [255, 255, 255];
const TRANSPARENT   = null;               // sentinel for adaptive icon bg

// ---------------------------------------------------------------------------
// Minimal PNG encoder  (RGBA, 8-bit)
// ---------------------------------------------------------------------------

function crc32(buf) {
  const table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })();
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const dataLen = Buffer.alloc(4);
  dataLen.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf   = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([dataLen, typeBuf, data, crcBuf]);
}

/**
 * Encode an RGBA pixel array (Uint8Array, row-major, 4 bytes/pixel) as PNG.
 * @param {number} w
 * @param {number} h
 * @param {Uint8Array} pixels  length == w * h * 4
 * @returns {Buffer}
 */
function encodePNG(w, h, pixels) {
  // Build raw filter-byte + scanline data
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const rowStart = y * (1 + w * 4);
    raw[rowStart] = 0; // filter type: None
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4;
      const dst = rowStart + 1 + x * 4;
      raw[dst]     = pixels[src];
      raw[dst + 1] = pixels[src + 1];
      raw[dst + 2] = pixels[src + 2];
      raw[dst + 3] = pixels[src + 3];
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 6 });

  const sig  = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8]  = 8;  // bit depth
  ihdr[9]  = 6;  // colour type: RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Drawing primitives  (all operate on a flat Uint8Array pixel buffer)
// ---------------------------------------------------------------------------

function setPixel(pixels, w, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= w || y >= Math.floor(pixels.length / (w * 4))) return;
  const i = (y * w + x) * 4;
  pixels[i]     = r;
  pixels[i + 1] = g;
  pixels[i + 2] = b;
  pixels[i + 3] = a;
}

/** Fill entire canvas with one colour. */
function fillRect(pixels, w, h, x0, y0, x1, y1, r, g, b, a) {
  for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) {
      setPixel(pixels, w, x, y, r, g, b, a);
    }
  }
}

/**
 * Draw a rounded rectangle outline (filled) using a simple per-pixel test.
 * cornerRadius applies to all four corners.
 */
function fillRoundRect(pixels, w, h, rx, ry, rw, rh, radius, r, g, b, a) {
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      // Distance to nearest corner centre
      const cx = (x < rx + radius) ? rx + radius : (x > rx + rw - radius - 1) ? rx + rw - radius - 1 : x;
      const cy = (y < ry + radius) ? ry + radius : (y > ry + rh - radius - 1) ? ry + rh - radius - 1 : y;
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) {
        setPixel(pixels, w, x, y, r, g, b, a);
      }
    }
  }
}

/** Draw a filled circle. */
function fillCircle(pixels, w, cx, cy, radius, r, g, b, a) {
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) {
        setPixel(pixels, w, x, y, r, g, b, a);
      }
    }
  }
}

/**
 * Draw a line with a given thickness (integer pixel width).
 * Uses Bresenham under the hood, thickened by filling a small square per point.
 */
function drawLine(pixels, w, h, x0, y0, x1, y1, thickness, r, g, b, a) {
  const half = Math.floor(thickness / 2);
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0, y = y0;
  while (true) {
    fillRect(pixels, w, h, x - half, y - half, x + half + 1, y + half + 1, r, g, b, a);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 <  dx) { err += dx; y += sy; }
  }
}

// ---------------------------------------------------------------------------
// Bitmap font for "DV" text  (5x7 pixel glyphs, 1-bit encoding)
// ---------------------------------------------------------------------------

const GLYPHS = {
  D: [
    0b11110,
    0b10001,
    0b10001,
    0b10001,
    0b10001,
    0b10001,
    0b11110,
  ],
  V: [
    0b10001,
    0b10001,
    0b10001,
    0b01010,
    0b01010,
    0b00100,
    0b00100,
  ],
};

/**
 * Render a string using the 5x7 bitmap font, scaled up by `scale`.
 * @param {string} text  characters to draw
 * @param {number} px    top-left x
 * @param {number} py    top-left y
 * @param {number} scale pixel-magnification factor
 */
function drawText(pixels, w, text, px, py, scale, r, g, b, a) {
  let xOffset = 0;
  for (const ch of text.toUpperCase()) {
    const glyph = GLYPHS[ch];
    if (!glyph) { xOffset += (5 + 1) * scale; continue; }
    for (let row = 0; row < 7; row++) {
      const bits = glyph[row];
      for (let col = 0; col < 5; col++) {
        if (bits & (1 << (4 - col))) {
          fillRect(pixels, w, 99999,
            px + xOffset + col * scale,
            py + row * scale,
            px + xOffset + col * scale + scale,
            py + row * scale + scale,
            r, g, b, a);
        }
      }
    }
    xOffset += (5 + 1) * scale; // 1-pixel gap between chars
  }
}

// ---------------------------------------------------------------------------
// Icon-drawing logic
// ---------------------------------------------------------------------------

/**
 * Draw the DocView logo onto a pixel buffer.
 *
 * The logo consists of:
 *   - A document rectangle with a folded top-right corner, in BLUE
 *   - Three horizontal "text lines" inside the document body, in WHITE at 60 % opacity
 *   - "DV" lettering centred on the document, in WHITE
 *
 * @param {Uint8Array} pixels  RGBA buffer, already filled with background
 * @param {number}     W       canvas width  (== height, assumed square)
 * @param {boolean}    transparent  if true, background pixels stay alpha=0
 */
function drawLogo(pixels, W, transparent) {
  const S = W / 1024; // scale factor relative to 1024-base design

  const s = n => Math.round(n * S);

  // Document body dimensions (centred in canvas)
  const docW  = s(480);
  const docH  = s(580);
  const docX  = Math.round((W - docW) / 2);
  const docY  = Math.round((W - docH) / 2);
  const corner = s(80);  // fold size
  const radius = s(24);  // rounded corners (bottom only really, top-left only)

  const [br, bg, bb] = BLUE;
  const [wr, wg, wb] = WHITE;

  // --- Document base rectangle (minus folded corner area) ---
  // We draw the full rect first, then overwrite the fold triangle.

  // Full rounded rect for document
  fillRoundRect(pixels, W, W,
    docX, docY, docW, docH, radius,
    br, bg, bb, 255);

  // Erase the top-right corner triangle and replace with a lighter shade
  // (simulate the fold by drawing two triangles)
  const foldX = docX + docW - corner;
  const foldY = docY + corner;

  // Triangle 1: the cut-off part (background colour / transparent)
  for (let y = docY; y < foldY; y++) {
    // How far along the fold line are we?
    const t = (y - docY) / corner; // 0 at top, 1 at fold crease
    const xCut = docX + docW - Math.round((1 - t) * corner);
    for (let x = xCut; x < docX + docW; x++) {
      if (transparent) {
        setPixel(pixels, W, x, y, 0, 0, 0, 0);
      } else {
        setPixel(pixels, W, x, y, ...BG_COLOR, 255);
      }
    }
  }

  // Triangle 2: the folded flap (slightly lighter blue)
  const foldR = Math.min(255, br + 40);
  const foldG = Math.min(255, bg + 40);
  const foldB = Math.min(255, bb + 40);
  for (let y = docY; y < foldY; y++) {
    const t = (y - docY) / corner;
    const xStart = docX + docW - Math.round((1 - t) * corner);
    const xEnd   = docX + docW;
    for (let x = xStart; x < xEnd; x++) {
      setPixel(pixels, W, x, y, foldR, foldG, foldB, 255);
    }
  }

  // Fold crease line
  drawLine(pixels, W, W,
    foldX, docY, docX + docW - 1, foldY,
    Math.max(1, s(3)),
    wr, wg, wb, 180);

  // --- Horizontal "text lines" inside the document ---
  const lineX     = docX + s(60);
  const lineW     = docW - s(120);
  const lineH     = s(18);
  const lineAlpha = 120; // semi-transparent white
  const lineGap   = s(36);
  const firstLine = docY + s(180);

  for (let i = 0; i < 3; i++) {
    const ly = firstLine + i * (lineH + lineGap);
    // Last line is shorter for realism
    const lw = (i === 2) ? Math.round(lineW * 0.6) : lineW;
    fillRoundRect(pixels, W, W, lineX, ly, lw, lineH, s(6),
      wr, wg, wb, lineAlpha);
  }

  // --- "DV" centred on document ---
  const glyphScale = s(28);         // pixel scale for 5x7 glyph
  const textW      = (5 * 2 + 1) * glyphScale; // 2 chars, 1-gap between
  const textH      = 7 * glyphScale;
  const textX      = Math.round((W - textW) / 2);
  const textY      = Math.round(docY + docH * 0.55 - textH / 2);

  drawText(pixels, W, 'DV', textX, textY, glyphScale, wr, wg, wb, 255);
}

// ---------------------------------------------------------------------------
// Icon builders
// ---------------------------------------------------------------------------

function makeIcon(W, H, transparent) {
  const pixels = new Uint8Array(W * H * 4);

  if (!transparent) {
    // Fill background
    for (let i = 0; i < W * H; i++) {
      pixels[i * 4]     = BG_COLOR[0];
      pixels[i * 4 + 1] = BG_COLOR[1];
      pixels[i * 4 + 2] = BG_COLOR[2];
      pixels[i * 4 + 3] = 255;
    }
  }
  // else: all zeros = fully transparent, which is what we want

  drawLogo(pixels, W, transparent);
  return encodePNG(W, H, pixels);
}

function makeFavicon(W) {
  // Simplified favicon: blue rounded-rect with "DV" in white
  const pixels = new Uint8Array(W * W * 4);
  const [br, bg, bb] = BLUE;
  const [wr, wg, wb] = WHITE;

  // Background
  for (let i = 0; i < W * W; i++) {
    pixels[i * 4]     = BG_COLOR[0];
    pixels[i * 4 + 1] = BG_COLOR[1];
    pixels[i * 4 + 2] = BG_COLOR[2];
    pixels[i * 4 + 3] = 255;
  }

  // Blue rounded rect
  const pad = Math.round(W * 0.08);
  const r   = Math.round(W * 0.18);
  fillRoundRect(pixels, W, W, pad, pad, W - pad * 2, W - pad * 2, r,
    br, bg, bb, 255);

  // "DV" text — at 48px we can fit scale=3 (gives 5*3=15 wide per char)
  const scale = Math.max(1, Math.round(W / 20));
  const textW = (5 * 2 + 1) * scale;
  const textH = 7 * scale;
  const tx = Math.round((W - textW) / 2);
  const ty = Math.round((W - textH) / 2);
  drawText(pixels, W, 'DV', tx, ty, scale, wr, wg, wb, 255);

  return encodePNG(W, W, pixels);
}

// ---------------------------------------------------------------------------
// Main — generate files
// ---------------------------------------------------------------------------

const ASSETS = path.join(__dirname, 'assets');

const icons = [
  {
    file: 'icon.png',
    desc: '1024x1024 main app icon',
    build: () => makeIcon(1024, 1024, false),
  },
  {
    file: 'adaptive-icon.png',
    desc: '1024x1024 Android adaptive foreground (transparent bg)',
    build: () => makeIcon(1024, 1024, true),
  },
  {
    file: 'splash-icon.png',
    desc: '200x200 splash screen icon',
    build: () => makeIcon(200, 200, false),
  },
  {
    file: 'favicon.png',
    desc: '48x48 web favicon',
    build: () => makeFavicon(48),
  },
];

console.log('DocView icon generator');
console.log('======================');

for (const icon of icons) {
  process.stdout.write(`Generating ${icon.file} (${icon.desc})... `);
  try {
    const buf  = icon.build();
    const dest = path.join(ASSETS, icon.file);
    fs.writeFileSync(dest, buf);
    console.log(`OK  (${buf.length} bytes)`);
  } catch (err) {
    console.error(`FAILED\n  ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('\nDone.');
