import type { Rules } from './advance';

/**
 * The live game's rules. Features add their continuous systems (production)
 * and event handlers (build finished, army arrived...) here as they land.
 */
export const defaultRules: Rules = {
  systems: [],
  handlers: {},
};
