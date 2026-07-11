import type { CarStats, Driver, DriverInput } from '../core/types';

/** Distance between sampled trail points, px. */
export const TRAIL_SPACING = 10;
/** Trail segments you start with / can't burn below. */
export const MIN_TRAIL = 12;
/** Fuel units drained per second just by existing (Nitro's clock). */
export const FUEL_DRAIN = 1.1;
/** Extra fuel drain per second while boosting. */
export const BOOST_FUEL_DRAIN = 5;
/** Trail segments burned per second while boosting (snake.io risk/reward). */
export const BOOST_TRAIL_BURN = 7;
/** Speed multiplier while boosting. */
export const BOOST_MULT = 1.45;
/** Speed multiplier during barrel overdrive (free — no trail/fuel burn). */
export const OVERDRIVE_MULT = 1.5;
/** Fuel gained per orb. */
export const ORB_FUEL = 2.2;
/**
 * Trail segments gained per orb. Each segment is TRAIL_SPACING px, so this
 * must be large enough that a single orb visibly lengthens the tail.
 */
export const ORB_GROWTH = 3;

export interface TrailPoint {
  x: number;
  y: number;
}

/**
 * Pure car simulation: arcade drift physics + growing nitro trail.
 * No Phaser dependencies, so it is unit-testable and (later) can run
 * on a multiplayer server unchanged.
 */
export class CarSim {
  x = 0;
  y = 0;
  heading = 0;
  vx = 0;
  vy = 0;
  speed = 0;

  fuel: number;
  alive = true;
  /** Seconds of spin-out left (oil slick). */
  spinTimer = 0;
  spinDir = 1;
  /** Seconds of slow-down left (cones, potholes). */
  slowTimer = 0;
  /** Remaining hazard hits before a wreck. */
  hitPoints: number;

  trail: TrailPoint[] = [];
  trailLimit = MIN_TRAIL;

  kills = 0;
  orbsEaten = 0;
  boostMs = 0;
  boosting = false;
  /** Seconds of nitro-barrel overdrive left. */
  overdriveTimer = 0;
  /** Rank in the round leaderboard, updated by the arena. */
  rank = 0;

  constructor(
    public readonly id: number,
    public readonly driver: Driver,
    public stats: CarStats,
    public paintTint: number,
    public trailColors: number[],
  ) {
    this.fuel = stats.tank;
    this.hitPoints = stats.armor;
  }

  /** Round score, snake.io style: trail length is king, kills add flat bonus. */
  get score(): number {
    return Math.floor(this.trailLimit - MIN_TRAIL) + this.kills * 10;
  }

  spawnAt(x: number, y: number, heading: number): void {
    this.x = x;
    this.y = y;
    this.heading = heading;
    this.vx = Math.cos(heading) * 40;
    this.vy = Math.sin(heading) * 40;
    this.trail = [{ x, y }];
  }

  eatOrb(fuelValue = ORB_FUEL, growth = ORB_GROWTH): void {
    this.orbsEaten++;
    this.fuel = Math.min(this.stats.tank, this.fuel + fuelValue);
    this.trailLimit += growth;
  }

  /** Nitro barrel: free top-speed surge for `seconds`. */
  applyOverdrive(seconds: number): void {
    this.overdriveTimer = Math.max(this.overdriveTimer, seconds);
  }

  /** One hazard/bump hit. Returns true if this wrecked the car. */
  takeHit(): boolean {
    this.hitPoints--;
    return this.hitPoints < 0;
  }

  update(dt: number, input: DriverInput): void {
    if (!this.alive) return;

    const s = this.stats;
    const outOfFuel = this.fuel <= 0;

    // Boost needs trail to burn and fuel in the tank.
    this.boosting = input.boost && this.trailLimit > MIN_TRAIL && !outOfFuel;
    if (this.boosting) {
      this.trailLimit = Math.max(MIN_TRAIL, this.trailLimit - BOOST_TRAIL_BURN * dt);
      this.boostMs += dt * 1000;
    }

    // Fuel economy — Nitro's signature pressure.
    this.fuel = Math.max(0, this.fuel - (FUEL_DRAIN + (this.boosting ? BOOST_FUEL_DRAIN : 0)) * dt);

    // Steering. Spinning out overrides driver control.
    if (this.spinTimer > 0) {
      this.spinTimer -= dt;
      this.heading += this.spinDir * 9 * dt;
    } else {
      // Low-speed steering is weaker so cars can't pivot in place.
      const effectiveness = Math.min(1, Math.abs(this.speed) / 120 + 0.25);
      this.heading += input.steer * s.turnRate * effectiveness * dt;
    }

    // Throttle → target speed. Engine dies without fuel: coast to a stop.
    const slowMult = this.slowTimer > 0 ? 0.55 : 1;
    if (this.slowTimer > 0) this.slowTimer -= dt;
    if (this.overdriveTimer > 0) this.overdriveTimer -= dt;
    // Overdrive and boost don't stack — the stronger one wins.
    const boostMult = Math.max(
      this.boosting ? BOOST_MULT : 1,
      this.overdriveTimer > 0 ? OVERDRIVE_MULT : 1,
    );
    const targetSpeed = outOfFuel ? 0 : input.throttle * s.topSpeed * boostMult * slowMult;
    const rate = targetSpeed > this.speed ? s.accel : s.accel * 1.6;
    const delta = targetSpeed - this.speed;
    const step = rate * dt;
    this.speed += Math.abs(delta) <= step ? delta : Math.sign(delta) * step;

    // Drift: velocity chases the heading at `traction` rate (frame-rate normalized).
    // Spinning cars keep their momentum — that's what makes oil dangerous.
    const grip = this.spinTimer > 0 ? 0.015 : this.stats.traction;
    const t = 1 - Math.pow(1 - grip, dt * 60);
    const dirX = Math.cos(this.heading);
    const dirY = Math.sin(this.heading);
    this.vx += (dirX * this.speed - this.vx) * t;
    this.vy += (dirY * this.speed - this.vy) * t;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.sampleTrail();
  }

  private sampleTrail(): void {
    const last = this.trail[this.trail.length - 1];
    const dx = this.x - last.x;
    const dy = this.y - last.y;
    if (dx * dx + dy * dy >= TRAIL_SPACING * TRAIL_SPACING) {
      this.trail.push({ x: this.x, y: this.y });
    }
    const maxPoints = Math.floor(this.trailLimit);
    while (this.trail.length > maxPoints) this.trail.shift();
  }

  spinOut(): void {
    this.spinTimer = 0.9;
    this.spinDir = Math.random() < 0.5 ? -1 : 1;
  }

  /** Lose trail (pothole). */
  loseTrail(segments: number): void {
    this.trailLimit = Math.max(MIN_TRAIL, this.trailLimit - segments);
  }
}
