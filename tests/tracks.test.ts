import { describe, expect, it } from 'vitest';
import { buildPath, LapTracker } from '../src/game/racePath';
import { TRACKS } from '../src/config/tracks';
import { RaceBotDriver } from '../src/ai/RaceBotDriver';
import { CarSim } from '../src/game/CarSim';
import { CAR_CLASSES } from '../src/config/cars';

describe('track layouts', () => {
  for (const track of TRACKS) {
    describe(track.name, () => {
      const path = buildPath(track.controlPoints);

      it('stays inside the world with scenery margin', () => {
        for (const p of path.pts) {
          expect(p.x).toBeGreaterThan(track.roadWidth / 2);
          expect(p.y).toBeGreaterThan(track.roadWidth / 2);
          expect(p.x).toBeLessThan(track.size - track.roadWidth / 2);
          expect(p.y).toBeLessThan(track.size - track.roadWidth / 2);
        }
      });

      it('never overlaps itself (no two far-apart sections share asphalt)', () => {
        const n = path.pts.length;
        for (let i = 0; i < n; i++) {
          for (let j = i + 30; j < n; j++) {
            const circular = Math.min(j - i, n - (j - i));
            if (circular < 30) continue;
            const d = Math.hypot(path.pts[i].x - path.pts[j].x, path.pts[i].y - path.pts[j].y);
            expect(d, `samples ${i} and ${j} too close`).toBeGreaterThan(track.roadWidth + 20);
          }
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
});
