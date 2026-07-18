import type { CarStats } from '../core/types';

export interface CarClassDef {
  id: string;
  name: string;
  tagline: string;
  /** Driver level required to unlock. */
  unlockLevel: number;
  base: CarStats;
  /** Texture key of the SVG sprite baked in Boot. */
  texture: string;
}

export const CAR_CLASSES: CarClassDef[] = [
  {
    id: 'sports',
    name: 'Sports Car',
    tagline: 'The balanced all-rounder',
    unlockLevel: 1,
    base: { topSpeed: 272, accel: 420, traction: 0.16, turnRate: 4.0, tank: 100, armor: 2 },
    texture: 'car-sports',
  },
  {
    id: 'racer',
    name: 'Race Car',
    tagline: 'Blistering speed, fragile shell',
    unlockLevel: 4,
    base: { topSpeed: 320, accel: 500, traction: 0.12, turnRate: 3.6, tank: 85, armor: 1 },
    texture: 'car-racer',
  },
  {
    id: 'buggy',
    name: 'Turbo Buggy',
    tagline: 'Grips anything, shrugs off hits',
    unlockLevel: 7,
    base: { topSpeed: 248, accel: 380, traction: 0.22, turnRate: 4.5, tank: 115, armor: 3 },
    texture: 'car-buggy',
  },
];

export type UpgradeId = 'topSpeed' | 'accel' | 'traction' | 'tank' | 'armor';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  desc: string;
  maxLevel: number;
  /** Scrap cost of level n (1-based). */
  cost(level: number): number;
  /** Applies level n of this upgrade to stats in place. */
  apply(stats: CarStats, level: number): void;
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'topSpeed',
    name: 'Top Speed',
    desc: '+5% top speed per level',
    maxLevel: 5,
    cost: (l) => 120 * l,
    apply: (s, l) => {
      s.topSpeed *= 1 + 0.05 * l;
    },
  },
  {
    id: 'accel',
    name: 'Acceleration',
    desc: '+7% acceleration per level',
    maxLevel: 5,
    cost: (l) => 100 * l,
    apply: (s, l) => {
      s.accel *= 1 + 0.07 * l;
    },
  },
  {
    id: 'traction',
    name: 'Traction',
    desc: 'Tighter grip in corners',
    maxLevel: 5,
    cost: (l) => 110 * l,
    apply: (s, l) => {
      s.traction *= 1 + 0.08 * l;
    },
  },
  {
    id: 'tank',
    name: 'Fuel Tank',
    desc: '+8% tank capacity per level',
    maxLevel: 5,
    cost: (l) => 90 * l,
    apply: (s, l) => {
      s.tank *= 1 + 0.08 * l;
    },
  },
  {
    id: 'armor',
    name: 'Armor',
    desc: '+1 hazard hit survived per level',
    maxLevel: 3,
    cost: (l) => 150 * l,
    apply: (s, l) => {
      s.armor += l;
    },
  },
];

/** Compute effective stats for a car class with a set of upgrade levels. */
export function effectiveStats(
  classId: string,
  upgradeLevels: Partial<Record<UpgradeId, number>>,
): CarStats {
  const def = CAR_CLASSES.find((c) => c.id === classId) ?? CAR_CLASSES[0];
  const stats: CarStats = { ...def.base };
  for (const up of UPGRADES) {
    const level = upgradeLevels[up.id] ?? 0;
    if (level > 0) up.apply(stats, level);
  }
  return stats;
}
