// Generates placeholder app icons (a pixel-art longhouse) into public/.
// No dependencies: draws on a 16x16 grid, scales up with nearest-neighbour, writes PNG via zlib.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const C = { '.': [43, 29, 20], R: [217, 164, 65], W: [122, 78, 46], D: [61, 42, 29], G: [86, 110, 52] };
const ART = [
  '................',
  '................',
  '.......RR.......',
  '......RRRR......',
  '.....RRRRRR.....',
  '....RRRRRRRR....',
  '...RRRRRRRRRR...',
  '..RRRRRRRRRRRR..',
  '...WWWWWWWWWW...',
  '...WWWWWWWWWW...',
  '...WWWWDDWWWW...',
  '...WWWWDDWWWW...',
  '...WWWWDDWWWW...',
  '..GGGGGGGGGGGG..',
  '................',
  '................',
];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size, padding) {
  // padding: fraction of the icon left as background on each side (for maskable safe zone)
  const inner = Math.floor(size * (1 - 2 * padding));
  const scale = Math.floor(inner / 16);
  const offset = Math.floor((size - scale * 16) / 2);
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const gx = Math.floor((x - offset) / scale);
      const gy = Math.floor((y - offset) / scale);
      const ch = gx >= 0 && gx < 16 && gy >= 0 && gy < 16 ? ART[gy][gx] : '.';
      const [r, g, b] = C[ch];
      const i = y * (size * 3 + 1) + 1 + x * 3;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function svg() {
  const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  let rects = `<rect width="16" height="16" fill="${hex(C['.'])}"/>`;
  ART.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== '.') rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${hex(C[ch])}"/>`;
    }),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${rects}</svg>\n`;
}

writeFileSync('public/icon-192.png', png(192, 0));
writeFileSync('public/icon-512.png', png(512, 0));
writeFileSync('public/icon-maskable-512.png', png(512, 0.12));
writeFileSync('public/icon.svg', svg());
console.log('icons written');
