// One-time script: generates icon-192.png and icon-512.png in /public
// Run: node scripts/generate-icons.js
const fs   = require('fs');
const zlib = require('zlib');
const path = require('path');

// ── CRC32 ──────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const t   = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

// ── PNG builder ─────────────────────────────────────────────────────────────
// Draws: dark navy bg (#0f172a) + sky-blue "K" letter + bottom chart line
function makePNG(size) {
  const BG = [15, 23, 42];    // #0f172a  dark navy
  const AC = [56, 189, 248];  // #38bdf8  sky-400
  const WH = [255, 255, 255]; // white

  const rows = [];
  const pad  = Math.round(size * 0.18);
  const w    = size - pad * 2;
  const h    = size - pad * 2;

  for (let y = 0; y < size; y++) {
    const row = [0]; // filter byte (None)
    for (let x = 0; x < size; x++) {
      // Rounded square clipping
      const r   = size * 0.18;
      const lx  = Math.max(0, r - x);
      const ly  = Math.max(0, r - y);
      const rx  = Math.max(0, x - (size - 1 - r));
      const ry  = Math.max(0, y - (size - 1 - r));
      const d2  = Math.max(lx, rx) ** 2 + Math.max(ly, ry) ** 2;
      if (d2 > r * r) { row.push(BG[0], BG[1], BG[2]); continue; }

      // Coordinates relative to inner box
      const ix = x - pad;
      const iy = y - pad;
      let pixel = BG;

      // Draw "K" letter
      const sw = Math.max(1, Math.round(w * 0.12)); // stroke width
      const mx = Math.round(w * 0.5);               // mid-x

      // Vertical bar of K
      if (ix >= 0 && ix < sw && iy >= 0 && iy < h) {
        pixel = AC;
      }
      // Upper diagonal of K (top-right)
      else if (ix >= sw && ix < w && iy >= 0 && iy < Math.round(h / 2)) {
        const slope = (ix - sw) / (w - sw);
        const targetY = Math.round((1 - slope) * (h / 2));
        if (Math.abs(iy - targetY) <= sw) pixel = AC;
      }
      // Lower diagonal of K (bottom-right)
      else if (ix >= sw && ix < w && iy >= Math.round(h / 2) && iy < h) {
        const slope = (ix - sw) / (w - sw);
        const targetY = Math.round(h / 2 + slope * (h / 2));
        if (Math.abs(iy - targetY) <= sw) pixel = AC;
      }

      // Small chart line at bottom
      const barH = Math.round(size * 0.04);
      const barY = size - pad - barH;
      if (y >= barY && y < barY + barH && x >= pad && x < size - pad) {
        // Wavy line: sin pattern
        const wave = Math.round(barH / 2 + Math.sin((x / size) * Math.PI * 4) * barH * 0.4);
        if (Math.abs(y - barY - wave) <= Math.max(1, Math.round(barH * 0.25))) pixel = WH;
      }

      row.push(pixel[0], pixel[1], pixel[2]);
    }
    rows.push(Buffer.from(row));
  }

  const raw  = Buffer.concat(rows);
  const idat = zlib.deflateSync(raw, { level: 9 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB, no alpha

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Generate ────────────────────────────────────────────────────────────────
const publicDir = path.join(__dirname, '..', 'public');
[192, 512].forEach((sz) => {
  const buf  = makePNG(sz);
  const dest = path.join(publicDir, `icon-${sz}.png`);
  fs.writeFileSync(dest, buf);
  console.log(`✅ ${dest}  (${(buf.length / 1024).toFixed(1)} KB)`);
});
