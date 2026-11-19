// Draws the app icon (four colored tiles on dark) into PNGs. No dependencies.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function png(size, px) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function draw(size) {
  const px = Buffer.alloc(size * size * 4);
  const bg = hex('#14161c');
  const tiles = ['#4f8cff', '#e5484d', '#f2c40f', '#2fa36b'].map(hex);
  // Rounded-rect coverage with simple 4x supersampling.
  const inRR = (x, y, x0, y0, w, r) => {
    const cx = Math.max(x0 + r, Math.min(x, x0 + w - r)), cy = Math.max(y0 + r, Math.min(y, y0 + w - r));
    return x >= x0 && y >= y0 && x <= x0 + w && y <= y0 + w && (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  const t = size * 0.27, gap = size * 0.05, start = (size - 2 * t - gap) / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let col = [0, 0, 0], a = 0;
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      const fx = x + (sx + 0.5) / 4, fy = y + (sy + 0.5) / 4;
      let c = bg;
      for (let k = 0; k < 4; k++) {
        const x0 = start + (k % 2) * (t + gap), y0 = start + ((k / 2) | 0) * (t + gap);
        if (inRR(fx, fy, x0, y0, t, t * 0.22)) c = tiles[k];
      }
      col = col.map((v, i) => v + c[i]); a++;
    }
    const o = (y * size + x) * 4;
    px[o] = col[0] / a; px[o + 1] = col[1] / a; px[o + 2] = col[2] / a; px[o + 3] = 255;
  }
  return png(size, px);
}

for (const [name, size] of [['icon-192', 192], ['icon-512', 512], ['apple-touch-icon', 180]]) {
  writeFileSync(new URL(`../icons/${name}.png`, import.meta.url), draw(size));
}
console.log('icons written');
