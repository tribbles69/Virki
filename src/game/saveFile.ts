import { migrateSave, SaveError } from './migrate';
import type { GameState } from '../sim';

/** Wrapper around an exported save so we can recognise and version the file itself. */
interface SaveFile {
  game: 'virki';
  format: 1;
  exportedAt: string;
  state: GameState;
}

export function exportSaveText(state: GameState, exportedAt: Date): string {
  const file: SaveFile = { game: 'virki', format: 1, exportedAt: exportedAt.toISOString(), state };
  return JSON.stringify(file);
}

/** File name like virki-save-2026-11-21-0930.json (local time). */
export function exportFileName(at: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `virki-save-${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}.json`;
}

/** Parse an imported file's text into a valid current-version state, or throw SaveError. */
export function parseSaveText(text: string): GameState {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new SaveError('That file isn’t a Virki save (it isn’t valid JSON).');
  }
  if (typeof data !== 'object' || data === null || (data as { game?: unknown }).game !== 'virki') {
    throw new SaveError('That file isn’t a Virki save.');
  }
  return migrateSave((data as { state?: unknown }).state);
}
