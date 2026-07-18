import type { Driver, DriverInput } from '../core/types';
import type { CarSim } from '../game/CarSim';
import { nearestIndex, type RacePath } from '../game/racePath';

const TWO_PI = Math.PI * 2;

function angleDiff(a: number, b: number): number {
  let d = (b - a) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  return d;
}

/**
 * Waypoint-chasing race AI: aims at a look-ahead point on the centerline,
 * brakes for upcoming curvature, boosts on straights, and rubber-bands
 * mildly toward the player so races stay tight — very 1990.
 */
export class RaceBotDriver implements Driver {
  readonly isPlayer = false;
  car!: CarSim;
  private pathIdx = 0;
  /** Set by the race scene each frame: <0 bot is ahead of player, >0 behind. */
  rubberBand = 0;
  /** Per-bot skill 0.85..1.05 multiplies cornering confidence. */
  private skill: number;
  /** Lateral offset from centerline so bots take different lines. */
  private lane: number;

  constructor(
    public readonly name: string,
    private path: RacePath,
    startIdx: number,
  ) {
    this.pathIdx = startIdx;
    this.skill = 0.93 + Math.random() * 0.15;
    this.lane = (Math.random() - 0.5) * 70;
  }

  getInput(_dt: number): DriverInput {
    const car = this.car;
    if (!car) return { steer: 0, throttle: 0, boost: false };

    const n = this.path.pts.length;
    this.pathIdx = nearestIndex(this.path, car.x, car.y, this.pathIdx);

    // Look-ahead scales with speed; a farther probe senses the corner.
    const near = Math.max(6, Math.round(Math.abs(car.speed) / 28));
    const far = near * 2 + 8;
    const nearPt = this.path.pts[(this.pathIdx + near) % n];
    const farPt = this.path.pts[(this.pathIdx + far) % n];

    // Steer toward the near point, offset onto this bot's lane.
    const tangentA = Math.atan2(farPt.y - nearPt.y, farPt.x - nearPt.x);
    const tx = nearPt.x + Math.cos(tangentA + Math.PI / 2) * this.lane;
    const ty = nearPt.y + Math.sin(tangentA + Math.PI / 2) * this.lane;
    const desired = Math.atan2(ty - car.y, tx - car.x);
    const diff = angleDiff(car.heading, desired);
    const steer = Math.max(-1, Math.min(1, diff * 3));

    // Brake for corners: how much does the track bend between probes?
    const bend = Math.abs(angleDiff(Math.atan2(nearPt.y - car.y, nearPt.x - car.x), tangentA));
    let throttle = bend > 1.1 ? 0.58 : bend > 0.55 ? 0.85 : 1;
    // Rubber-band can push slightly past 1 so trailing bots claw back.
    throttle = Math.min(1.06, throttle * this.skill + this.rubberBand * 0.18);

    // Nitro on straights when fuel allows — hungrier when behind.
    const boost = bend < 0.32 && car.fuel > car.stats.tank * 0.35 && this.rubberBand > -0.25;

    return { steer, throttle, boost };
  }
}
