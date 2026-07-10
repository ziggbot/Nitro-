import { describe, expect, it } from 'vitest';
import { claimMission, dateKey, pickDailies, refreshMissions, touchStreak, trackMetric, missionDef } from '../src/meta/Missions';
import { defaultSave } from '../src/meta/SaveGame';

describe('missions', () => {
  it('picks 3 distinct dailies deterministically per date', () => {
    const a = pickDailies('2026-07-10');
    const b = pickDailies('2026-07-10');
    expect(a.map((m) => m.id)).toEqual(b.map((m) => m.id));
    expect(new Set(a.map((m) => m.id)).size).toBe(3);
  });

  it('rolls new dailies when the date changes', () => {
    const save = defaultSave();
    refreshMissions(save, new Date('2026-07-10T10:00:00'));
    const first = save.dailyMissions.map((m) => m.id);
    expect(first).toHaveLength(3);
    save.dailyMissions[0].progress = 99;
    refreshMissions(save, new Date('2026-07-11T10:00:00'));
    expect(save.dailyDate).toBe('2026-07-11');
    expect(save.dailyMissions.every((m) => m.progress === 0)).toBe(true);
    // Same day again: keeps state.
    save.dailyMissions[0].progress = 5;
    refreshMissions(save, new Date('2026-07-11T22:00:00'));
    expect(save.dailyMissions[0].progress).toBe(5);
  });

  it('tracks metrics only toward matching, unclaimed missions', () => {
    const save = defaultSave();
    refreshMissions(save, new Date('2026-07-10T10:00:00'));
    trackMetric(save, 'orbsEaten', 50);
    for (const state of save.dailyMissions) {
      const def = missionDef(state.id)!;
      expect(state.progress).toBe(def.metric === 'orbsEaten' ? Math.min(def.target, 50) : 0);
    }
  });

  it('caps progress at the target and pays out exactly once', () => {
    const save = defaultSave();
    refreshMissions(save, new Date('2026-07-10T10:00:00'));
    const state = save.dailyMissions[0];
    const def = missionDef(state.id)!;
    trackMetric(save, def.metric, def.target * 10);
    expect(state.progress).toBe(def.target);
    const reward = claimMission(save, state.id);
    expect(reward).toEqual({ scrap: def.rewardScrap, xp: def.rewardXp });
    expect(save.scrap).toBe(def.rewardScrap);
    expect(claimMission(save, state.id)).toBeNull();
  });

  it('increments streak on consecutive days and resets after a gap', () => {
    const save = defaultSave();
    touchStreak(save, new Date('2026-07-10T10:00:00'));
    expect(save.streakDays).toBe(1);
    touchStreak(save, new Date('2026-07-10T18:00:00'));
    expect(save.streakDays).toBe(1);
    touchStreak(save, new Date('2026-07-11T10:00:00'));
    expect(save.streakDays).toBe(2);
    touchStreak(save, new Date('2026-07-14T10:00:00'));
    expect(save.streakDays).toBe(1);
  });

  it('dateKey pads correctly', () => {
    expect(dateKey(new Date('2026-01-05T00:00:00'))).toBe('2026-01-05');
  });
});
