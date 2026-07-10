import type { Driver, DriverInput } from '../core/types';
import type { CarSim } from '../game/CarSim';
import { MIN_TRAIL } from '../game/CarSim';
import type { SpatialGrid } from '../game/SpatialGrid';

/** What a bot can perceive. The arena implements this. */
export interface BotWorld {
  arenaSize: number;
  /** Trail points of ALL cars (owner = car id). */
  trailGrid: SpatialGrid;
  orbGrid: SpatialGrid;
  cars: CarSim[];
  /** Hazard positions for avoidance. */
  hazards: { x: number; y: number; r: number }[];
}

export interface BotPersonality {
  /** 0..1 — how far it will detour for orbs. */
  greed: number;
  /** 0..1 — chance of hunting other cars by cutting them off. */
  aggression: number;
  /** 0..1 — how early it dodges danger. */
  caution: number;
  /** 0..1 — how eagerly it boosts. */
  boosty: number;
}

export function randomPersonality(): BotPersonality {
  return {
    greed: 0.4 + Math.random() * 0.6,
    aggression: Math.random(),
    caution: 0.35 + Math.random() * 0.6,
    boosty: Math.random(),
  };
}

const TWO_PI = Math.PI * 2;

function angleDiff(a: number, b: number): number {
  let d = (b - a) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  return d;
}

/**
 * Steering-behavior bot: dodge danger first (trails, walls, hazards),
 * otherwise chase orbs — or, for aggressive personalities, cut off rivals.
 */
export class BotDriver implements Driver {
  readonly isPlayer = false;
  /** Set by the arena after the CarSim is created. */
  car!: CarSim;
  world!: BotWorld;

  private targetTimer = 0;
  private huntId = -1;

  constructor(
    public readonly name: string,
    private personality: BotPersonality,
  ) {}

  getInput(dt: number): DriverInput {
    const car = this.car;
    const world = this.world;
    if (!car || !world) return { steer: 0, throttle: 0.5, boost: false };

    const p = this.personality;
    this.targetTimer -= dt;

    // --- Danger sensing: three whisker rays ahead. ---
    const lookAhead = Math.max(140, Math.abs(car.speed) * (0.55 + p.caution * 0.5));
    const dangers = [
      this.rayDanger(car, world, car.heading, lookAhead),
      this.rayDanger(car, world, car.heading - 0.55, lookAhead * 0.8),
      this.rayDanger(car, world, car.heading + 0.55, lookAhead * 0.8),
    ];

    if (dangers[0] > 0.25 || dangers[1] > 0.5 || dangers[2] > 0.5) {
      // Evade: turn away from the more dangerous side.
      const steer = dangers[1] > dangers[2] ? 1 : -1;
      return {
        steer,
        throttle: dangers[0] > 0.7 ? 0.45 : 0.85,
        boost: dangers[0] > 0.6 && car.trailLimit > MIN_TRAIL + 12 && Math.random() < p.boosty,
      };
    }

    // --- Target selection. ---
    let tx: number | null = null;
    let ty: number | null = null;
    let wantBoost = false;

    // Aggressive bots pick a victim to cut off.
    if (this.huntId >= 0) {
      const victim = world.cars.find((c) => c.id === this.huntId && c.alive);
      if (!victim || this.targetTimer <= 0) {
        this.huntId = -1;
      } else {
        // Aim ahead of the victim's nose so our trail lands in their path.
        const lead = 0.7;
        tx = victim.x + victim.vx * lead;
        ty = victim.y + victim.vy * lead;
        wantBoost = car.trailLimit > MIN_TRAIL + 20 && Math.random() < p.boosty * 0.6;
      }
    } else if (Math.random() < p.aggression * 0.006) {
      // Occasionally acquire a hunt target nearby.
      let best: CarSim | null = null;
      let bestD2 = 700 * 700;
      for (const other of world.cars) {
        if (other === car || !other.alive) continue;
        const dx = other.x - car.x;
        const dy = other.y - car.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = other;
        }
      }
      if (best) {
        this.huntId = best.id;
        this.targetTimer = 3 + Math.random() * 3;
      }
    }

    // Default: graze the nearest orb.
    if (tx === null) {
      const searchR = 300 + p.greed * 500;
      const orb = world.orbGrid.nearest(car.x, car.y, searchR);
      if (orb) {
        tx = orb.x;
        ty = orb.y;
      } else {
        // Wander toward the arena center-ish.
        tx = world.arenaSize * (0.3 + Math.random() * 0.4);
        ty = world.arenaSize * (0.3 + Math.random() * 0.4);
      }
    }

    const desired = Math.atan2((ty as number) - car.y, (tx as number) - car.x);
    const diff = angleDiff(car.heading, desired);
    const steer = Math.max(-1, Math.min(1, diff * 2.2));

    // Ease off in tight turns; keep fuel healthy before boosting.
    const throttle = Math.abs(diff) > 1.6 ? 0.55 : 1;
    const boost = wantBoost && car.fuel > car.stats.tank * 0.3;

    return { steer, throttle, boost };
  }

  /** Danger 0..1 along a ray: trail points, walls, hazards. */
  private rayDanger(car: CarSim, world: BotWorld, angle: number, length: number): number {
    const steps = 4;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    let danger = 0;

    for (let i = 1; i <= steps; i++) {
      const d = (length * i) / steps;
      const px = car.x + dirX * d;
      const py = car.y + dirY * d;
      const weight = 1 - (i - 1) / steps; // closer samples matter more

      // Walls are lethal.
      const margin = 60;
      if (px < margin || py < margin || px > world.arenaSize - margin || py > world.arenaSize - margin) {
        danger = Math.max(danger, weight);
        continue;
      }

      // Any rival trail point near this sample is lethal.
      let hit = false;
      world.trailGrid.query(px, py, 26, (pt) => {
        if (pt.owner !== car.id) {
          hit = true;
          return true;
        }
      });
      if (hit) {
        danger = Math.max(danger, weight);
        continue;
      }

      // Hazards are soft danger.
      for (const h of world.hazards) {
        const dx = h.x - px;
        const dy = h.y - py;
        if (dx * dx + dy * dy < (h.r + 14) * (h.r + 14)) {
          danger = Math.max(danger, weight * 0.5);
          break;
        }
      }
    }
    return danger;
  }
}
