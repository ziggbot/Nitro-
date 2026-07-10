import { describe, expect, it } from 'vitest';
import { CarSim, FUEL_DRAIN, MIN_TRAIL } from '../src/game/CarSim';
import type { Driver } from '../src/core/types';

const dummyDriver: Driver = {
  name: 'test',
  isPlayer: false,
  getInput: () => ({ steer: 0, throttle: 1, boost: false }),
};

function makeCar(): CarSim {
  const car = new CarSim(
    1,
    dummyDriver,
    { topSpeed: 300, accel: 400, traction: 0.12, turnRate: 3, tank: 100, armor: 2 },
    0xffffff,
    [0xffffff],
  );
  car.spawnAt(1000, 1000, 0);
  return car;
}

describe('car simulation', () => {
  it('drains fuel over time (the Nitro clock)', () => {
    const car = makeCar();
    car.update(1, { steer: 0, throttle: 1, boost: false });
    expect(car.fuel).toBeCloseTo(100 - FUEL_DRAIN, 5);
  });

  it('accelerates toward top speed and moves', () => {
    const car = makeCar();
    for (let i = 0; i < 300; i++) car.update(1 / 60, { steer: 0, throttle: 1, boost: false });
    expect(car.speed).toBeGreaterThan(290);
    expect(car.x).toBeGreaterThan(1200);
  });

  it('boost burns trail down but never below the minimum', () => {
    const car = makeCar();
    car.trailLimit = MIN_TRAIL + 10;
    for (let i = 0; i < 600; i++) car.update(1 / 60, { steer: 0, throttle: 1, boost: true });
    expect(car.trailLimit).toBe(MIN_TRAIL);
    // With no trail left to burn, boost stops engaging.
    car.update(1 / 60, { steer: 0, throttle: 1, boost: true });
    expect(car.boosting).toBe(false);
  });

  it('orbs grow the trail and refill fuel up to the tank cap', () => {
    const car = makeCar();
    const before = car.trailLimit;
    car.fuel = 99.9;
    car.eatOrb();
    expect(car.trailLimit).toBe(before + 1);
    expect(car.fuel).toBe(100);
    expect(car.orbsEaten).toBe(1);
  });

  it('trail length is capped by trailLimit', () => {
    const car = makeCar();
    for (let i = 0; i < 1200; i++) car.update(1 / 60, { steer: 0.3, throttle: 1, boost: false });
    expect(car.trail.length).toBeLessThanOrEqual(Math.floor(car.trailLimit));
    expect(car.trail.length).toBeGreaterThan(3);
  });

  it('engine dies without fuel: car coasts to a stop', () => {
    const car = makeCar();
    car.fuel = 0.001;
    for (let i = 0; i < 600; i++) car.update(1 / 60, { steer: 0, throttle: 1, boost: false });
    expect(car.fuel).toBe(0);
    expect(Math.abs(car.speed)).toBeLessThan(5);
  });

  it('score combines trail growth and kills', () => {
    const car = makeCar();
    expect(car.score).toBe(0);
    car.trailLimit = MIN_TRAIL + 20;
    car.kills = 2;
    expect(car.score).toBe(40);
  });
});
