import { PAINTS, TRAIL_STYLES, type UnlockCondition } from '../config/cosmetics';
import { CAR_CLASSES, UPGRADES, type UpgradeId } from '../config/cars';
import { ARENAS } from '../config/arenas';
import { levelForXp } from './Progression';
import type { SaveData } from './SaveGame';

export function conditionMet(save: SaveData, cond: UnlockCondition): boolean {
  switch (cond.kind) {
    case 'default':
      return true;
    case 'level':
      return levelForXp(save.xp) >= cond.value;
    case 'totalKills':
      return save.lifetime.kills >= cond.value;
    case 'totalOrbs':
      return save.lifetime.orbsEaten >= cond.value;
    case 'streakDays':
      return save.streakDays >= cond.value;
    case 'trophies':
      return save.trophies >= cond.value;
  }
}

export function unlockedPaints(save: SaveData): string[] {
  return PAINTS.filter((p) => conditionMet(save, p.unlock)).map((p) => p.id);
}

export function unlockedTrails(save: SaveData): string[] {
  return TRAIL_STYLES.filter((t) => conditionMet(save, t.unlock)).map((t) => t.id);
}

export function unlockedCars(save: SaveData): string[] {
  const level = levelForXp(save.xp);
  return CAR_CLASSES.filter((c) => level >= c.unlockLevel).map((c) => c.id);
}

export function unlockedArenas(save: SaveData): string[] {
  return ARENAS.filter((a) => save.trophies >= a.unlockTrophies).map((a) => a.id);
}

/** Buy the next level of an upgrade for a car. Returns false if not affordable/maxed. */
export function buyUpgrade(save: SaveData, carId: string, upgradeId: UpgradeId): boolean {
  const def = UPGRADES.find((u) => u.id === upgradeId);
  if (!def) return false;
  const carUps = (save.upgrades[carId] ??= {});
  const current = carUps[upgradeId] ?? 0;
  if (current >= def.maxLevel) return false;
  const cost = def.cost(current + 1);
  if (save.scrap < cost) return false;
  save.scrap -= cost;
  carUps[upgradeId] = current + 1;
  return true;
}
