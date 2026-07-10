import { describe, expect, it } from 'vitest';
import { defaultSave, loadSave, migrate, persistSave, SAVE_VERSION } from '../src/meta/SaveGame';
import { buyUpgrade } from '../src/meta/Unlocks';

function fakeStorage(): Pick<Storage, 'getItem' | 'setItem'> & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe('save game', () => {
  it('returns defaults for empty or corrupt storage', () => {
    const storage = fakeStorage();
    expect(loadSave(storage)).toEqual(defaultSave());
    storage.data['nitro-io-save'] = '{not json';
    expect(loadSave(storage)).toEqual(defaultSave());
  });

  it('round-trips through persist/load', () => {
    const storage = fakeStorage();
    const save = defaultSave();
    save.xp = 1234;
    save.scrap = 500;
    save.upgrades = { sports: { topSpeed: 2 } };
    persistSave(save, storage);
    expect(loadSave(storage)).toEqual(save);
  });

  it('migrates partial/older saves without losing recognized fields', () => {
    const migrated = migrate({ version: 0, xp: 999, lifetime: { kills: 42 } });
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.xp).toBe(999);
    expect(migrated.lifetime.kills).toBe(42);
    expect(migrated.lifetime.orbsEaten).toBe(0);
    expect(migrated.selectedCar).toBe('sports');
  });
});

describe('garage purchases', () => {
  it('buys upgrades while affordable and stops at max level', () => {
    const save = defaultSave();
    save.scrap = 10_000;
    for (let i = 0; i < 5; i++) {
      expect(buyUpgrade(save, 'sports', 'topSpeed')).toBe(true);
    }
    expect(buyUpgrade(save, 'sports', 'topSpeed')).toBe(false);
    expect(save.upgrades.sports?.topSpeed).toBe(5);
  });

  it('rejects purchases the player cannot afford', () => {
    const save = defaultSave();
    save.scrap = 10;
    expect(buyUpgrade(save, 'sports', 'topSpeed')).toBe(false);
    expect(save.scrap).toBe(10);
  });
});
