import type { Rules } from './advance';
import { production } from './economy';
import { BUILD_COMPLETE, onBuildComplete } from './build';
import { RECRUIT_DONE, onRecruitDone } from './recruit';
import { MARCH_ARRIVE, MARCH_RETURN, onMarchArrive, onMarchReturn } from './march';
import { DAILY_RESET, onDailyReset } from './daily';
import { RAID_ARRIVE, onRaidArrive } from './raid';
import { RESEARCH_COMPLETE, onResearchComplete } from './smithy';
import { SMELT_DONE, metalProduction, onSmeltDone } from './metals';

/**
 * The live game's rules. Features add their continuous systems (production)
 * and event handlers (build finished, army arrived...) here as they land.
 */
export const defaultRules: Rules = {
  systems: [production, metalProduction],
  handlers: {
    [BUILD_COMPLETE]: onBuildComplete,
    [RECRUIT_DONE]: onRecruitDone,
    [MARCH_ARRIVE]: onMarchArrive,
    [MARCH_RETURN]: onMarchReturn,
    [DAILY_RESET]: onDailyReset,
    [RAID_ARRIVE]: onRaidArrive,
    [RESEARCH_COMPLETE]: onResearchComplete,
    [SMELT_DONE]: onSmeltDone,
  },
};
