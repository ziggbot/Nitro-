import { PALETTE } from './palette';

/**
 * Cosmetics are earned, never bought — snake.io's fair-play rule.
 * Unlock conditions reference lifetime stats or streaks from the save file.
 */
export interface UnlockCondition {
  kind: 'level' | 'totalKills' | 'totalOrbs' | 'streakDays' | 'trophies' | 'default';
  value: number;
  label: string;
}

export interface PaintDef {
  id: string;
  name: string;
  tint: number;
  unlock: UnlockCondition;
}

export interface TrailStyleDef {
  id: string;
  name: string;
  /** Gradient stops head → tail. */
  colors: number[];
  unlock: UnlockCondition;
}

export const PAINTS: PaintDef[] = [
  { id: 'cyan', name: 'Neon Cyan', tint: PALETTE.cyan, unlock: { kind: 'default', value: 0, label: 'Starter' } },
  { id: 'magenta', name: 'Hot Magenta', tint: PALETTE.magenta, unlock: { kind: 'level', value: 2, label: 'Reach level 2' } },
  { id: 'amber', name: 'Sunset Amber', tint: PALETTE.amber, unlock: { kind: 'level', value: 5, label: 'Reach level 5' } },
  { id: 'lime', name: 'Toxic Lime', tint: PALETTE.lime, unlock: { kind: 'totalOrbs', value: 3000, label: 'Eat 3000 orbs' } },
  { id: 'violet', name: 'Ultraviolet', tint: PALETTE.violet, unlock: { kind: 'totalKills', value: 50, label: 'Wreck 50 rivals' } },
  { id: 'gold', name: 'Champion Gold', tint: PALETTE.gold, unlock: { kind: 'trophies', value: 30, label: 'Earn 30 trophies' } },
  { id: 'white', name: 'Ghost White', tint: 0xf0f4ff, unlock: { kind: 'streakDays', value: 5, label: '5-day play streak' } },
];

export const TRAIL_STYLES: TrailStyleDef[] = [
  { id: 'flame', name: 'Nitro Flame', colors: [0xfff2c0, PALETTE.amber, 0xff5a1f], unlock: { kind: 'default', value: 0, label: 'Starter' } },
  { id: 'neon', name: 'Neon Stream', colors: [0xd0fdff, PALETTE.cyan, 0x0060ff], unlock: { kind: 'level', value: 3, label: 'Reach level 3' } },
  { id: 'plasma', name: 'Plasma', colors: [0xffd0f4, PALETTE.magenta, PALETTE.violet], unlock: { kind: 'totalKills', value: 20, label: 'Wreck 20 rivals' } },
  { id: 'rainbow', name: 'Rainbow', colors: [0xff3b3b, PALETTE.amber, PALETTE.lime, PALETTE.cyan, PALETTE.violet], unlock: { kind: 'streakDays', value: 3, label: '3-day play streak' } },
  { id: 'toxic', name: 'Toxic Sludge', colors: [0xeaffb0, PALETTE.lime, 0x1f7a2a], unlock: { kind: 'trophies', value: 20, label: 'Earn 20 trophies' } },
];
