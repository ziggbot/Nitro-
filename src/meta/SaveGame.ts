import type { UpgradeId } from '../config/cars';

/**
 * Versioned save schema persisted to localStorage. Bump VERSION and add a
 * migration step in `migrate` whenever the shape changes.
 */
export const SAVE_KEY = 'nitro-io-save';
export const SAVE_VERSION = 1;

export interface MissionState {
  id: string;
  progress: number;
  claimed: boolean;
}

export interface SaveData {
  version: number;
  /** Display name in multiplayer lobbies and ghost challenges. */
  playerName: string;
  xp: number;
  scrap: number;
  trophies: number;
  selectedCar: string;
  selectedPaint: string;
  selectedTrail: string;
  selectedFuel: string;
  selectedArena: string;
  /** Fireball weapons in races (front-page toggle). */
  shootingEnabled: boolean;
  /** Per-track blackout toggle; wasteland-gp defaults on. */
  blackoutTracks: Record<string, boolean>;
  /** upgrades[carId][upgradeId] = level */
  upgrades: Record<string, Partial<Record<UpgradeId, number>>>;
  lifetime: {
    orbsEaten: number;
    kills: number;
    surviveMs: number;
    boostMs: number;
    runs: number;
    scrapEarned: number;
    nightRuns: number;
    bestScore: number;
    bestKills: number;
    bestSurvivalMs: number;
  };
  /** ISO date (YYYY-MM-DD) of last play, for streak tracking. */
  lastPlayDate: string;
  streakDays: number;
  /** Date key the current daily missions were rolled for. */
  dailyDate: string;
  dailyMissions: MissionState[];
  /** Week key (YYYY-WW) the weekly challenge was rolled for. */
  weeklyKey: string;
  weeklyMission: MissionState | null;
  /** Personal best board: top 5 runs. */
  bestRuns: { score: number; kills: number; arena: string; date: string }[];
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    playerName: '',
    xp: 0,
    scrap: 0,
    trophies: 0,
    selectedCar: 'sports',
    selectedPaint: 'cyan',
    selectedTrail: 'flame',
    selectedFuel: 'petrol',
    selectedArena: 'city-day',
    shootingEnabled: true,
    blackoutTracks: { 'wasteland-gp': true },
    upgrades: {},
    lifetime: {
      orbsEaten: 0,
      kills: 0,
      surviveMs: 0,
      boostMs: 0,
      runs: 0,
      scrapEarned: 0,
      nightRuns: 0,
      bestScore: 0,
      bestKills: 0,
      bestSurvivalMs: 0,
    },
    lastPlayDate: '',
    streakDays: 0,
    dailyDate: '',
    dailyMissions: [],
    weeklyKey: '',
    weeklyMission: null,
    bestRuns: [],
  };
}

/** Migrate any older/partial save to the current schema. */
export function migrate(raw: unknown): SaveData {
  const base = defaultSave();
  if (typeof raw !== 'object' || raw === null) return base;
  const data = raw as Partial<SaveData>;
  // Future: switch on data.version for stepwise migrations.
  return {
    ...base,
    ...data,
    version: SAVE_VERSION,
    lifetime: { ...base.lifetime, ...(data.lifetime ?? {}) },
    upgrades: data.upgrades ?? {},
    blackoutTracks: { ...base.blackoutTracks, ...(data.blackoutTracks ?? {}) },
    bestRuns: Array.isArray(data.bestRuns) ? data.bestRuns.slice(0, 5) : [],
  };
}

export function loadSave(storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): SaveData {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    return migrate(JSON.parse(raw));
  } catch {
    return defaultSave();
  }
}

export function persistSave(
  data: SaveData,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): void {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or blocked — play on without persistence.
  }
}
