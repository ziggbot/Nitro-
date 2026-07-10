/**
 * Core simulation types. The DriverInput seam is what makes the game
 * multiplayer-ready: a car doesn't care whether its input comes from the
 * local player, a bot, or (later) the network.
 */

export interface DriverInput {
  /** Steering, -1 (left) .. 1 (right). */
  steer: number;
  /** Throttle 0..1. */
  throttle: number;
  /** Boost pressed (burns trail + fuel). */
  boost: boolean;
}

export interface Driver {
  readonly name: string;
  readonly isPlayer: boolean;
  getInput(dt: number): DriverInput;
}

/** Effective car stats after class base + garage upgrades. */
export interface CarStats {
  topSpeed: number; // px/s
  accel: number; // px/s^2
  /** 0..1 velocity-follows-heading factor per tick — higher = grippier. */
  traction: number;
  turnRate: number; // rad/s at full steer
  tank: number; // max fuel units
  /** Hits survivable from hazards/bumps. */
  armor: number;
}

export type CauseOfDeath = 'trail' | 'wall' | 'fuel' | 'hazard';

export interface RunResult {
  score: number;
  kills: number;
  orbsEaten: number;
  survivalMs: number;
  bestRank: number;
  scrapEarned: number;
  xpEarned: number;
  starsEarned: number;
  causeOfDeath: CauseOfDeath;
  envId: string;
  night: boolean;
  killedBy?: string;
}
