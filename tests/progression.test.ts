import { describe, expect, it } from 'vitest';
import { applyRewards, levelForXp, starsForRun, xpForLevel, xpProgress } from '../src/meta/Progression';

describe('progression', () => {
  it('starts at level 1 with 0 xp', () => {
    expect(levelForXp(0)).toBe(1);
  });

  it('levels up after the first threshold', () => {
    expect(levelForXp(xpForLevel(1))).toBe(2);
    expect(levelForXp(xpForLevel(1) - 1)).toBe(1);
  });

  it('level curve is monotonic', () => {
    for (let l = 1; l < 30; l++) {
      expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l));
    }
  });

  it('xpProgress resets within each level', () => {
    const [cur, need] = xpProgress(xpForLevel(1) + 50);
    expect(cur).toBe(50);
    expect(need).toBe(xpForLevel(2));
  });

  it('awards 0 stars for a bad run and 3 for a great one', () => {
    expect(starsForRun({ survivalMs: 10_000, kills: 0, score: 5 })).toBe(0);
    expect(starsForRun({ survivalMs: 200_000, kills: 5, score: 100 })).toBe(3);
  });

  it('applies arena reward multiplier', () => {
    const base = {
      score: 50,
      kills: 2,
      orbsEaten: 100,
      survivalMs: 60_000,
      bestRank: 3,
      causeOfDeath: 'trail' as const,
      envId: 'city',
      night: false,
    };
    const normal = applyRewards(base, 1);
    const doubled = applyRewards(base, 2);
    expect(doubled.xpEarned).toBe(normal.xpEarned * 2);
    expect(doubled.scrapEarned).toBe(normal.scrapEarned * 2);
    expect(doubled.starsEarned).toBe(normal.starsEarned);
  });
});
