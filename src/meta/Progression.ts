import type { RunResult } from '../core/types';

/** XP needed to go from level n to n+1. */
export function xpForLevel(level: number): number {
  return 400 + (level - 1) * 250;
}

/** Driver level (1-based) for a total XP amount. */
export function levelForXp(xp: number): number {
  let level = 1;
  let remaining = xp;
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level++;
  }
  return level;
}

/** XP progress within the current level: [current, needed]. */
export function xpProgress(xp: number): [number, number] {
  let level = 1;
  let remaining = xp;
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level++;
  }
  return [remaining, xpForLevel(level)];
}

/**
 * End-of-run stars (0-3), Nitro-trophy style:
 * one each for survival time, kills and score thresholds.
 */
export function starsForRun(r: { survivalMs: number; kills: number; score: number }): number {
  let stars = 0;
  if (r.survivalMs >= 120_000) stars++;
  if (r.kills >= 3) stars++;
  if (r.score >= 100) stars++;
  return stars;
}

/** XP earned for a run before arena multiplier. */
export function xpForRun(r: { survivalMs: number; kills: number; orbsEaten: number }): number {
  return Math.round(r.survivalMs / 1000 + r.kills * 25 + r.orbsEaten * 0.5);
}

/** Scrap earned for a run before arena multiplier. */
export function scrapForRun(r: { kills: number; orbsEaten: number; score: number }): number {
  return Math.round(r.kills * 15 + r.orbsEaten * 0.2 + r.score * 0.3);
}

/** Rewards for a race by finishing position (1-based). DNF = position 0. */
export function raceRewards(
  position: number,
  totalCars: number,
  rewardMult: number,
): { xp: number; scrap: number; stars: number } {
  if (position < 1) {
    // DNF still pays a little for showing up.
    return { xp: Math.round(60 * rewardMult), scrap: Math.round(25 * rewardMult), stars: 0 };
  }
  const beaten = totalCars - position;
  const xp = Math.round((160 + beaten * 130) * rewardMult);
  const scrap = Math.round((70 + beaten * 75) * rewardMult);
  const stars = position === 1 ? 3 : position === 2 ? 2 : position === 3 ? 1 : 0;
  return { xp, scrap, stars };
}

/** Apply an arena reward multiplier to a raw run result. */
export function applyRewards(
  raw: Omit<RunResult, 'xpEarned' | 'scrapEarned' | 'starsEarned'>,
  rewardMult: number,
): RunResult {
  return {
    ...raw,
    xpEarned: Math.round(xpForRun(raw) * rewardMult),
    scrapEarned: Math.round(scrapForRun(raw) * rewardMult),
    starsEarned: starsForRun(raw),
  };
}
