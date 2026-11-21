import { deriveSeed, Rng } from './rng';
import type { Gear } from './battle';
import { UNITS } from './data/units';
import type { GameState } from './state';

// ─── The Lord / Hersir (DESIGN §8) ───────────────────────────────────────
// One unique leader. Rides with an army (a bonus to its attack) or stays home
// (the same bonus to defence against raids). Never dies. Levels from battle
// experience, capped by the Lord's Keep. Edit the tables to rebalance.

/** Titles by level: the bonus applies to armies the Lord leads, and to defence at home. */
export const LORD_TITLES = [
  { name: 'Thane', from: 1, bonus: 0.05 },
  { name: 'Hersir', from: 10, bonus: 0.1 },
  { name: 'Jarl', from: 20, bonus: 0.15 },
  { name: 'High Jarl', from: 30, bonus: 0.2 },
  { name: 'King', from: 40, bonus: 0.25 },
] as const;

/** Experience to go from level L to L+1 = LORD_XP_BASE × LORD_XP_GROWTH^(L-1). */
export const LORD_XP_BASE = 100;
export const LORD_XP_GROWTH = 1.15;
/** Experience per battle: the enemy's strength ÷ this (won), or ÷ LORD_XP_LOSS_DIVISOR (lost). */
export const LORD_XP_WIN_DIVISOR = 10;
export const LORD_XP_LOSS_DIVISOR = 40;
/** The Lord rides: minutes per tile when the army is faster, or alone. */
export const LORD_SPEED = 10;

const LORD_NAMES = ['Ragnvald', 'Sigrun', 'Eirik', 'Astrid', 'Hallvard', 'Thyra', 'Gunnar', 'Ingrid', 'Bjorn', 'Solveig', 'Ulf', 'Freydis'] as const;

export interface Lord {
  name: string;
  /** Total experience earned (levels above the Keep's cap wait here until it grows). */
  xp: number;
}

export function newLord(seed: string): Lord {
  return { name: new Rng(deriveSeed(seed, 'lord')).pick(LORD_NAMES), xp: 0 };
}

/** Total experience needed to reach a level (level 1 = 0). */
export function xpForLevel(level: number): number {
  let total = 0;
  for (let L = 1; L < level; L++) total += LORD_XP_BASE * LORD_XP_GROWTH ** (L - 1);
  return Math.round(total);
}

/** Level the experience alone would give (no cap). */
export function levelFromXp(xp: number): number {
  let level = 1;
  while (level < 1000 && xp >= xpForLevel(level + 1)) level++;
  return level;
}

/** True once the Lord's Keep is built (the Lord arrives with it). */
export const hasLord = (state: GameState) => state.buildings.keep > 0;

export interface LordStatus {
  name: string;
  level: number;
  /** Level the Keep allows. */
  cap: number;
  /** True when experience is waiting on a bigger Keep. */
  capped: boolean;
  title: string;
  bonus: number;
  xp: number;
  /** Experience at the start of this level and needed for the next (undefined at the cap). */
  levelXp: number;
  nextXp?: number;
  /** Where the Lord is. */
  away: boolean;
}

export function lordStatus(state: GameState): LordStatus {
  const cap = Math.max(1, state.buildings.keep);
  const raw = levelFromXp(state.lord.xp);
  const level = Math.min(raw, cap);
  let t = 0;
  for (let i = 0; i < LORD_TITLES.length; i++) if (level >= LORD_TITLES[i].from) t = i;
  return {
    name: state.lord.name,
    level,
    cap,
    capped: raw > cap,
    title: LORD_TITLES[t].name,
    bonus: LORD_TITLES[t].bonus,
    xp: state.lord.xp,
    levelXp: xpForLevel(level),
    nextXp: level < cap ? xpForLevel(level + 1) : undefined,
    away: lordAway(state),
  };
}

export const lordAway = (state: GameState) => state.marches.some((m) => m.lord);

/** The Lord can ride out: Keep built and at home. */
export const lordAvailable = (state: GameState) => hasLord(state) && !lordAway(state);

/** "Hersir Sigrun" */
export function lordTitleName(state: GameState): string {
  const st = lordStatus(state);
  return `${st.title} ${st.name}`;
}

/** Scale a gear table's attack (leading an army) or defence (at home) by the Lord's bonus. */
export function withLordBonus(gear: Gear, bonus: number, stat: 'attack' | 'defence'): Gear {
  const out: Gear = {};
  for (const u of UNITS) {
    const g = gear[u] ?? { attack: 1, defence: 1 };
    out[u] = { ...g, [stat]: g[stat] * (1 + bonus) };
  }
  return out;
}

/**
 * Give the Lord experience from a battle. Returns a note if the Lord gained a
 * level (or title), else undefined.
 */
export function awardLordXp(state: GameState, enemyStrength: number, won: boolean): string | undefined {
  const before = lordStatus(state);
  state.lord.xp += Math.round(enemyStrength / (won ? LORD_XP_WIN_DIVISOR : LORD_XP_LOSS_DIVISOR));
  const after = lordStatus(state);
  if (after.level === before.level) return undefined;
  return after.title !== before.title
    ? `${before.name} is now ${after.title} (level ${after.level})`
    : `${after.title} ${after.name} reached level ${after.level}`;
}
