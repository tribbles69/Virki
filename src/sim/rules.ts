import type { Rules } from './advance';
import { production } from './economy';
import { BUILD_COMPLETE, onBuildComplete } from './build';

/**
 * The live game's rules. Features add their continuous systems (production)
 * and event handlers (build finished, army arrived...) here as they land.
 */
export const defaultRules: Rules = {
  systems: [production],
  handlers: {
    [BUILD_COMPLETE]: onBuildComplete,
  },
};
