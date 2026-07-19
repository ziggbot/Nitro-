import { describe, expect, it } from 'vitest';
import { buildPath, findCrossings, LapTracker } from '../src/game/racePath';
import { TRACKS } from '../src/config/tracks';
import { RaceBotDriver } from '../src/ai/RaceBotDriver';
import { CarSim } from '../src/game/CarSim';
import { CAR_CLASSES } from '../src/config/cars';

describe('track layouts', () => {
  for (const track of TRACKS) {
    describe(track.name, () => {
      const path = buildPath(track.controlPoints);
      const crossings = findCrossings(path, track.roadWidth);

      it('stays inside the world with scenery margin', () => {
        for (const p of path.pts) {
          expect(p.x).toBeGreaterThan(track.roadWidth / 2);
          expect(p.y).toBeGreaterThan(track.roadWidth / 2);
          expect(p.x).toBeLessThan(track.size - track.roadWidth / 2);
          expect(p.y).toBeLessThan(track.size - track.roadWidth / 2);
        }
      });

      it('never overlaps itself outside declared bridge crossings', () => {
        const n = path.pts.length;
        for (let i = 0; i < n; i++) {
          for (let j = i + 30; j < n; j++) {
            const circular = Math.min(j - i, n - (j - i));
            if (circular < 30) continue;
            const d = Math.hypot(path.pts[i].x - path.pts[j].x, path.pts[i].y - path.pts[j].y);
            if (d > track.roadWidth + 20) continue;
            // Close approach is only legal right at a bridge crossing.
            const mx = (path.pts[i].x + path.pts[j].x) / 2;
            const my = (path.pts[i].y + path.pts[j].y) / 2;
            const nearCrossing = crossings.some((c) => Math.hypot(c.x - mx, c.y - my) < track.roadWidth * 2.2);
            expect(nearCrossing, `samples ${i} and ${j} overlap away from any crossing`).toBe(true);
          }
        }
      });

      it('shortcut cuts stay within the lap tracker search window', () => {
        for (const sc of track.shortcuts ?? []) {
          const skipped = (sc.to - sc.from) * 18;
          expect(skipped).toBeGreaterThan(0);
          expect(skipped, 'shortcut skips too far for nearestIndex window').toBeLessThan(55);
        }
      });

      it('a race bot can lap it', () => {
        const bot = new RaceBotDriver('TestBot', path, 0);
        const stats = { ...CAR_CLASSES[1].base };
        const car = new CarSim(1, bot, stats, 0xffffff, []);
        bot.car = car;
        car.freeBoost = true;
        const p0 = path.pts[0];
        const p1 = path.pts[3];
        car.spawnAt(p0.x, p0.y, Math.atan2(p1.y - p0.y, p1.x - p0.x));
        const tracker = new LapTracker(path, 0);

        const dt = 1 / 30;
        let t = 0;
        while (tracker.lap < 1 && t < 240) {
          car.fuel = stats.tank; // the scene refuels via pickups; not under test
          car.update(dt, bot.getInput(dt));
          tracker.update(car.x, car.y);
          t += dt;
        }
        expect(tracker.lap, `bot needed >240s sim for one lap of ${track.name}`).toBeGreaterThanOrEqual(1);
      });
    });
  }

  it('only the crossover track has a bridge crossing — exactly one', () => {
    for (const track of TRACKS) {
      const crossings = findCrossings(buildPath(track.controlPoints), track.roadWidth);
      expect(crossings.length, track.name).toBe(track.id === 'crossover-gp' ? 1 : 0);
    }
  });

  it('airborne cars fly straight and land steerable', () => {
    const stats = { ...CAR_CLASSES[1].base };
    const car = new CarSim(1, { name: 't', isPlayer: true, getInput: () => ({ steer: 1, throttle: 1, boost: false }) }, stats, 0xffffff, []);
    car.spawnAt(0, 0, 0);
    car.speed = 300;
    car.vx = 300;
    car.vy = 0;
    car.launch(0.5);
    const h0 = car.heading;
    for (let t = 0; t < 0.5; t += 1 / 60) car.update(1 / 60, { steer: 1, throttle: 1, boost: false });
    expect(car.heading).toBe(h0); // no steering mid-air
    expect(car.x).toBeGreaterThan(120); // momentum carried it forward
    expect(car.airTimer).toBeLessThanOrEqual(0.02);
    car.update(0.1, { steer: 1, throttle: 1, boost: false });
    expect(car.heading).toBeGreaterThan(h0); // grounded again, steering works
  });
});
