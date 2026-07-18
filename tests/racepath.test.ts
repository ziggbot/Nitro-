import { describe, expect, it } from 'vitest';
import { buildPath, LapTracker, nearestIndex } from '../src/game/racePath';
import { TRACKS } from '../src/config/tracks';
import { raceRewards } from '../src/meta/Progression';

const SQUARE = [
  { x: 0, y: 0 },
  { x: 1000, y: 0 },
  { x: 1000, y: 1000 },
  { x: 0, y: 1000 },
];

describe('race path', () => {
  it('builds a closed loop with monotonic cumulative distance', () => {
    const path = buildPath(SQUARE);
    expect(path.pts.length).toBe(4 * 18);
    for (let i = 1; i < path.pts.length; i++) {
      expect(path.pts[i].dist).toBeGreaterThan(path.pts[i - 1].dist);
    }
    // Total ≈ perimeter of the smoothed square (a bit over 4000 due to bulging).
    expect(path.total).toBeGreaterThan(3500);
    expect(path.total).toBeLessThan(5500);
  });

  it('nearestIndex finds the closest sample within the window', () => {
    const path = buildPath(SQUARE);
    const target = path.pts[10];
    expect(nearestIndex(path, target.x + 3, target.y - 3, 5)).toBe(10);
  });

  it('LapTracker counts forward laps and undoes backward crossings', () => {
    const path = buildPath(SQUARE);
    const tracker = new LapTracker(path, 0);
    const n = path.pts.length;
    // Drive forward around the loop in steps.
    for (let lap = 0; lap < 2; lap++) {
      for (let i = 0; i < n; i += 10) {
        tracker.update(path.pts[i].x, path.pts[i].y);
      }
      tracker.update(path.pts[0].x, path.pts[0].y);
    }
    expect(tracker.lap).toBe(2);
    // Progress is monotonic with laps.
    expect(tracker.progress).toBeGreaterThanOrEqual(2 * path.total);
    // Reverse over the line: lap goes back down.
    tracker.update(path.pts[n - 5].x, path.pts[n - 5].y);
    expect(tracker.lap).toBe(1);
  });

  it('the shipped track builds a sane loop', () => {
    const path = buildPath(TRACKS[0].controlPoints);
    expect(path.total).toBeGreaterThan(6000);
    for (const p of path.pts) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.y).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(TRACKS[0].size);
      expect(p.y).toBeLessThan(TRACKS[0].size);
    }
  });
});

describe('race rewards', () => {
  it('pays more for better placements and 3 stars for a win', () => {
    const first = raceRewards(1, 6, 1);
    const third = raceRewards(3, 6, 1);
    const last = raceRewards(6, 6, 1);
    expect(first.xp).toBeGreaterThan(third.xp);
    expect(third.xp).toBeGreaterThan(last.xp);
    expect(first.stars).toBe(3);
    expect(third.stars).toBe(1);
    expect(last.stars).toBe(0);
  });

  it('DNF pays a small consolation with no stars', () => {
    const dnf = raceRewards(0, 6, 1);
    expect(dnf.stars).toBe(0);
    expect(dnf.xp).toBeGreaterThan(0);
    expect(dnf.xp).toBeLessThan(raceRewards(6, 6, 1).xp + 100);
  });

  it('scales with the track reward multiplier', () => {
    expect(raceRewards(1, 6, 2).xp).toBe(raceRewards(1, 6, 1).xp * 2);
  });
});
