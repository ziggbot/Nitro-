/**
 * Mission pool. Three dailies are picked deterministically from the date,
 * plus one bigger weekly challenge.
 */
export type MissionMetric =
  | 'orbsEaten'
  | 'kills'
  | 'surviveMs'
  | 'boostMs'
  | 'runs'
  | 'scrapEarned'
  | 'nightRuns';

export interface MissionDef {
  id: string;
  text: string;
  metric: MissionMetric;
  target: number;
  rewardScrap: number;
  rewardXp: number;
  weekly?: boolean;
}

export const DAILY_MISSIONS: MissionDef[] = [
  { id: 'd-orbs-200', text: 'Collect 200 fuel orbs', metric: 'orbsEaten', target: 200, rewardScrap: 80, rewardXp: 120 },
  { id: 'd-orbs-400', text: 'Collect 400 fuel orbs', metric: 'orbsEaten', target: 400, rewardScrap: 140, rewardXp: 200 },
  { id: 'd-kills-5', text: 'Wreck 5 rivals with your trail', metric: 'kills', target: 5, rewardScrap: 100, rewardXp: 150 },
  { id: 'd-kills-10', text: 'Wreck 10 rivals with your trail', metric: 'kills', target: 10, rewardScrap: 180, rewardXp: 260 },
  { id: 'd-survive-4m', text: 'Survive 4 minutes total', metric: 'surviveMs', target: 240_000, rewardScrap: 90, rewardXp: 140 },
  { id: 'd-survive-8m', text: 'Survive 8 minutes total', metric: 'surviveMs', target: 480_000, rewardScrap: 160, rewardXp: 220 },
  { id: 'd-boost-30s', text: 'Boost for 30 seconds total', metric: 'boostMs', target: 30_000, rewardScrap: 70, rewardXp: 110 },
  { id: 'd-runs-3', text: 'Finish 3 runs', metric: 'runs', target: 3, rewardScrap: 60, rewardXp: 100 },
  { id: 'd-scrap-300', text: 'Earn 300 scrap in runs', metric: 'scrapEarned', target: 300, rewardScrap: 120, rewardXp: 160 },
];

export const WEEKLY_MISSIONS: MissionDef[] = [
  { id: 'w-kills-40', text: 'Weekly: wreck 40 rivals', metric: 'kills', target: 40, rewardScrap: 600, rewardXp: 900, weekly: true },
  { id: 'w-orbs-2500', text: 'Weekly: collect 2500 fuel orbs', metric: 'orbsEaten', target: 2500, rewardScrap: 550, rewardXp: 800, weekly: true },
  { id: 'w-survive-45m', text: 'Weekly: survive 45 minutes total', metric: 'surviveMs', target: 2_700_000, rewardScrap: 650, rewardXp: 950, weekly: true },
  { id: 'w-night-5', text: 'Weekly: finish 5 night runs', metric: 'nightRuns', target: 5, rewardScrap: 700, rewardXp: 1000, weekly: true },
];
