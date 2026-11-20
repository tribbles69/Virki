import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Enforces the CLAUDE.md rule: game logic gets time and randomness passed in.
const BANNED = [
  /\bDate\.now\s*\(/,
  /\bnew Date\s*\(/,
  /\bMath\.random\s*\(/,
  /\bperformance\.now\s*\(/,
  /\bdocument\./,
  /\bwindow\./,
  /\blocalStorage\b/,
  /\bsetTimeout\b|\bsetInterval\b/,
];

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? files(join(dir, d.name)) : d.name.endsWith('.ts') ? [join(dir, d.name)] : [],
  );
}

describe('src/sim purity', () => {
  it('uses no clock, global randomness, timers or browser APIs', () => {
    const offences: string[] = [];
    for (const f of files('src/sim')) {
      const code = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      for (const re of BANNED) if (re.test(code)) offences.push(`${f}: ${re}`);
    }
    expect(offences).toEqual([]);
  });
});
