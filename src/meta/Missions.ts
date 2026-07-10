import { DAILY_MISSIONS, WEEKLY_MISSIONS, type MissionDef, type MissionMetric } from '../config/missions';
import type { SaveData, MissionState } from './SaveGame';

/** Deterministic small hash so daily picks are stable for a given date. */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function weekKey(d: Date): string {
  // ISO-ish week number, good enough for a weekly rotation.
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d.getTime() - jan1.getTime()) / 86_400_000);
  return `${d.getFullYear()}-W${Math.floor(days / 7)}`;
}

/** Pick 3 daily missions deterministically from the date. */
export function pickDailies(key: string): MissionDef[] {
  const picked: MissionDef[] = [];
  const pool = [...DAILY_MISSIONS];
  let seed = hashString(key);
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const idx = seed % pool.length;
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

export function pickWeekly(key: string): MissionDef {
  return WEEKLY_MISSIONS[hashString(key) % WEEKLY_MISSIONS.length];
}

/** Roll new dailies/weekly if the date rolled over; also updates streak. */
export function refreshMissions(save: SaveData, now: Date): void {
  const today = dateKey(now);
  if (save.dailyDate !== today) {
    save.dailyDate = today;
    save.dailyMissions = pickDailies(today).map((m) => ({ id: m.id, progress: 0, claimed: false }));
  }
  const week = weekKey(now);
  if (save.weeklyKey !== week || !save.weeklyMission) {
    save.weeklyKey = week;
    save.weeklyMission = { id: pickWeekly(week).id, progress: 0, claimed: false };
  }
}

/** Update the daily-play streak. Call once when a run finishes. */
export function touchStreak(save: SaveData, now: Date): void {
  const today = dateKey(now);
  if (save.lastPlayDate === today) return;
  const yesterday = dateKey(new Date(now.getTime() - 86_400_000));
  save.streakDays = save.lastPlayDate === yesterday ? save.streakDays + 1 : 1;
  save.lastPlayDate = today;
}

export function missionDef(id: string): MissionDef | undefined {
  return DAILY_MISSIONS.find((m) => m.id === id) ?? WEEKLY_MISSIONS.find((m) => m.id === id);
}

/** Add metric progress to all active, unclaimed missions. */
export function trackMetric(save: SaveData, metric: MissionMetric, amount: number): void {
  const states: MissionState[] = [...save.dailyMissions];
  if (save.weeklyMission) states.push(save.weeklyMission);
  for (const state of states) {
    const def = missionDef(state.id);
    if (!def || def.metric !== metric || state.claimed) continue;
    state.progress = Math.min(def.target, state.progress + amount);
  }
}

/** Record a finished run into missions + lifetime stats. */
export function trackRun(
  save: SaveData,
  run: { orbsEaten: number; kills: number; survivalMs: number; boostMs: number; scrapEarned: number; night: boolean; score: number },
): void {
  trackMetric(save, 'orbsEaten', run.orbsEaten);
  trackMetric(save, 'kills', run.kills);
  trackMetric(save, 'surviveMs', run.survivalMs);
  trackMetric(save, 'boostMs', run.boostMs);
  trackMetric(save, 'scrapEarned', run.scrapEarned);
  trackMetric(save, 'runs', 1);
  if (run.night) trackMetric(save, 'nightRuns', 1);

  const life = save.lifetime;
  life.orbsEaten += run.orbsEaten;
  life.kills += run.kills;
  life.surviveMs += run.survivalMs;
  life.boostMs += run.boostMs;
  life.runs += 1;
  life.scrapEarned += run.scrapEarned;
  if (run.night) life.nightRuns += 1;
  life.bestScore = Math.max(life.bestScore, run.score);
  life.bestKills = Math.max(life.bestKills, run.kills);
  life.bestSurvivalMs = Math.max(life.bestSurvivalMs, run.survivalMs);
}

/** Claim a completed mission; returns the reward or null if not claimable. */
export function claimMission(
  save: SaveData,
  id: string,
): { scrap: number; xp: number } | null {
  const state =
    save.dailyMissions.find((m) => m.id === id) ??
    (save.weeklyMission?.id === id ? save.weeklyMission : undefined);
  const def = missionDef(id);
  if (!state || !def || state.claimed || state.progress < def.target) return null;
  state.claimed = true;
  save.scrap += def.rewardScrap;
  save.xp += def.rewardXp;
  return { scrap: def.rewardScrap, xp: def.rewardXp };
}
