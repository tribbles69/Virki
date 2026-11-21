// Placeholder wall art, one picture per era (DESIGN §5.1), drawn with blocky
// SVG shapes until the real pixel art arrives in v0.7.

const W = 120;
const H = 32;
const GROUND = 28;

const C = {
  sky: '#2b3a4a',
  grass: '#4d5a2c',
  earth: '#6b5233',
  wood: '#8a5a32',
  woodDark: '#5e3b20',
  stone: '#8d8a80',
  stoneDark: '#615e57',
  stoneLight: '#b3ad9f',
  water: '#2f5568',
  rune: '#6ff0e0',
  roof: '#7a2e22',
} as const;

const rect = (x: number, y: number, w: number, h: number, fill: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;

/** A row of stakes with pointed tops. */
function stakes(x0: number, x1: number, top: number, gap: number, w = 3): string {
  let out = '';
  for (let x = x0; x + w <= x1; x += w + gap) {
    out += rect(x, top + 2, w, GROUND - top - 2, C.wood);
    out += rect(x + 1, top, 1, 2, C.wood);
    out += rect(x + w - 1, top + 2, 1, GROUND - top - 2, C.woodDark);
  }
  return out;
}

/** A wall with crenellations along the top. */
function wall(x0: number, x1: number, top: number, body: string, dark: string, bottom = GROUND): string {
  let out = rect(x0, top + 2, x1 - x0, bottom - top - 2, body);
  for (let x = x0; x < x1; x += 4) out += rect(x, top, 2, 2, body);
  for (let y = top + 5; y < bottom; y += 4) for (let x = x0 + ((y / 4) % 2 ? 0 : 3); x < x1; x += 6) out += rect(x, y, 1, 1, dark);
  return out;
}

function tower(x: number, top: number, w: number, body: string, dark: string, roof?: string): string {
  let out = wall(x, x + w, top, body, dark);
  out += rect(x + Math.floor(w / 2) - 1, top + 6, 2, 3, '#1a1410');
  if (roof) out += `<polygon points="${x - 1},${top} ${x + w / 2},${top - 6} ${x + w + 1},${top}" fill="${roof}"/>`;
  return out;
}

function gate(x: number, top: number, w: number): string {
  return rect(x, top, w, GROUND - top, '#1a1410') + rect(x, top, w, 1, C.stoneDark);
}

const ERA_ART: ((uid: string) => string)[] = [
  // 0 Wooden stakes
  () => stakes(6, 114, 18, 5),
  // 1 Palisade
  () => stakes(4, 52, 12, 0) + gate(52, 16, 16) + stakes(68, 116, 12, 0),
  // 2 Earth rampart + palisade
  () => `<polygon points="0,${GROUND} 8,20 112,20 120,${GROUND}" fill="${C.earth}"/>` + stakes(10, 52, 8, 0) + gate(52, 12, 16) + stakes(68, 110, 8, 0),
  // 3 Dry-stone wall
  () => wall(4, 52, 14, C.stone, C.stoneDark) + gate(52, 16, 16) + wall(68, 116, 14, C.stone, C.stoneDark),
  // 4 Mortared stone + wooden towers
  () =>
    wall(4, 116, 13, C.stoneLight, C.stoneDark) +
    tower(10, 6, 10, C.wood, C.woodDark, C.roof) +
    tower(100, 6, 10, C.wood, C.woodDark, C.roof) +
    gate(54, 16, 12),
  // 5 Stone towers + gatehouse
  () =>
    wall(4, 116, 12, C.stoneLight, C.stoneDark) +
    tower(8, 4, 12, C.stone, C.stoneDark) +
    tower(100, 4, 12, C.stone, C.stoneDark) +
    tower(50, 2, 20, C.stone, C.stoneDark) +
    gate(55, 14, 10),
  // 6 Curtain wall + moat
  () =>
    wall(4, 116, 8, C.stoneLight, C.stoneDark, 26) +
    tower(6, 0, 12, C.stone, C.stoneDark, C.roof) +
    tower(102, 0, 12, C.stone, C.stoneDark, C.roof) +
    gate(55, 14, 10) +
    rect(0, 26, W, 4, C.water),
  // 7 Concentric walls
  () =>
    wall(14, 106, 2, C.stoneDark, '#4a4842', 20) +
    tower(20, -2, 10, C.stoneDark, '#4a4842') +
    tower(90, -2, 10, C.stoneDark, '#4a4842') +
    wall(2, 118, 12, C.stoneLight, C.stoneDark, 26) +
    gate(55, 16, 10) +
    rect(0, 26, W, 4, C.water),
  // 8 Star fort bastions
  () => {
    // Arrow-headed bastions jutting out from a thick, low curtain wall, behind a wet ditch.
    const bastion = (cx: number) =>
      `<polygon points="${cx - 12},26 ${cx - 12},12 ${cx},2 ${cx + 12},12 ${cx + 12},26" fill="${C.stone}"/>` +
      `<polygon points="${cx},2 ${cx + 12},12 ${cx + 12},26 ${cx},26" fill="${C.stoneDark}"/>` +
      rect(cx - 1, 10, 2, 3, '#1a1410');
    return (
      wall(10, 110, 10, C.stoneLight, C.stoneDark, 26) +
      bastion(14) +
      bastion(60) +
      bastion(106) +
      gate(56, 16, 8) +
      rect(0, 26, W, 4, C.water)
    );
  },
  // 9 Mythic citadel (rune-carved, glowing)
  (uid) =>
    `<defs><filter id="glow-${uid}"><feGaussianBlur stdDeviation="1.2"/></filter></defs>` +
    wall(2, 118, 8, '#7d8590', '#555c66') +
    tower(4, -4, 14, '#7d8590', '#555c66') +
    tower(102, -4, 14, '#7d8590', '#555c66') +
    tower(50, -6, 20, '#7d8590', '#555c66') +
    gate(55, 12, 10) +
    `<g fill="${C.rune}" filter="url(#glow-${uid})">${[24, 36, 76, 88].map((x) => rect(x, 14, 2, 6, C.rune) + rect(x - 1, 16, 4, 1, C.rune)).join('')}${rect(59, 0, 2, 4, C.rune)}</g>` +
    [24, 36, 76, 88].map((x) => rect(x, 14, 2, 6, C.rune)).join(''),
];

let uidCounter = 0;

/** SVG markup for a wall era (0..9), or a bare field for "no wall". */
export function wallArt(era: number | undefined, label: string): string {
  const uid = `w${++uidCounter}`;
  const body = era === undefined ? '' : ERA_ART[Math.max(0, Math.min(ERA_ART.length - 1, era))](uid);
  return (
    `<svg viewBox="0 -8 ${W} ${H + 8}" role="img" aria-label="${label}" preserveAspectRatio="xMidYMax meet" shape-rendering="crispEdges">` +
    rect(0, -8, W, GROUND + 8, C.sky) +
    rect(0, GROUND, W, H - GROUND, C.grass) +
    body +
    `</svg>`
  );
}
