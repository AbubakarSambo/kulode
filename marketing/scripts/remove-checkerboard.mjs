/**
 * remove-checkerboard.mjs
 *
 * Removes the classic Photoshop/GIMP checkerboard background
 * (alternating white #fff / light-grey #c0c0c0 tiles) from
 * lady_cutout.png using a BFS flood-fill starting from image
 * borders + corners.
 *
 * Uses `sharp` (bundled with Vite/Astro) — no extra installs.
 */

import sharp from 'sharp';
import { writeFileSync } from 'fs';

const INPUT  = 'c:/dev_projects/Tari1/marketing/public/lady_cutout.png';
const OUTPUT = 'c:/dev_projects/Tari1/marketing/public/lady_cutout_clean.png';
const TOLERANCE = 28; // colour distance threshold (0-441)

// The two checkerboard tile colours
const TILES = [
  [255, 255, 255], // white
  [204, 204, 204], // light grey (Photoshop)
  [192, 192, 192], // light grey (GIMP / older tools)
  [188, 188, 188], // slight variation
];

function dist(r1,g1,b1, r2,g2,b2) {
  return Math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2);
}

function isBackground(r, g, b) {
  return TILES.some(([tr,tg,tb]) => dist(r,g,b,tr,tg,tb) <= TOLERANCE);
}

const { data, info } = await sharp(INPUT)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width, height, channels } = info;
console.log(`Image: ${width}×${height} ch=${channels}`);

const pixels = new Uint8ClampedArray(data.buffer);
const visited = new Uint8Array(width * height);
const queue = [];

function enqueue(x, y) {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  const i = y * width + x;
  if (visited[i]) return;
  const p = i * 4;
  if (isBackground(pixels[p], pixels[p+1], pixels[p+2])) {
    visited[i] = 1;
    queue.push(i);
  }
}

// Seed from all four edges
for (let x = 0; x < width;  x++) { enqueue(x, 0); enqueue(x, height-1); }
for (let y = 0; y < height; y++) { enqueue(0, y); enqueue(width-1, y); }

console.log(`BFS seeds: ${queue.length}`);

// BFS flood-fill
let head = 0;
while (head < queue.length) {
  const i = queue[head++];
  const x = i % width, y = Math.floor(i / width);
  enqueue(x+1, y); enqueue(x-1, y);
  enqueue(x, y+1); enqueue(x, y-1);
}

// Make visited pixels fully transparent
let removed = 0;
for (let i = 0; i < width * height; i++) {
  if (visited[i]) {
    pixels[i*4+3] = 0;
    removed++;
  }
}

const pct = (removed / (width * height) * 100).toFixed(1);
console.log(`Removed ${removed} pixels (${pct}%)`);

// Write output
const outBuffer = await sharp(Buffer.from(pixels.buffer), {
  raw: { width, height, channels: 4 },
}).png().toBuffer();

writeFileSync(OUTPUT, outBuffer);
console.log(`✅ Saved: ${OUTPUT}`);
