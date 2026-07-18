import Phaser from 'phaser';
import type { FuelDef } from '../config/fuels';
import type { CarSim } from './CarSim';

/**
 * Per-car exhaust effects styled by fuel type. A light idle emission
 * while driving makes every car's type readable at a glance; boosting
 * or overdrive turns it into a full afterburner.
 */
export class ExhaustFx {
  private jet: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke?: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene, car: CarSim, fuel: FuelDef) {
    const electric = fuel.flicker;
    const rocket = fuel.smoke; // gas = rocket-style jet plume
    const tints = fuel.exhaustTints;
    // Rocket plume: tight cone, fast straight particles, long tail.
    // Electric: wide short sharp sparks. Petrol: classic fire spray.
    const spread = rocket ? 7 : electric ? 24 : 15;
    this.jet = scene.add.particles(0, 0, 'dot', {
      speed: rocket ? { min: 260, max: 400 } : electric ? { min: 120, max: 260 } : { min: 80, max: 190 },
      angle: {
        onEmit: () => Phaser.Math.RadToDeg(car.heading + Math.PI) + (Math.random() * spread * 2 - spread),
      },
      x: { min: -4, max: 4 },
      y: { min: -4, max: 4 },
      scale: rocket ? { start: 1.5, end: 0.1 } : { start: electric ? 1.2 : 1.7, end: 0 },
      alpha: { start: 0.95, end: 0 },
      lifespan: rocket ? { min: 220, max: 460 } : electric ? { min: 70, max: 190 } : { min: 150, max: 330 },
      frequency: 16,
      quantity: rocket ? 3 : 2,
      tint: { onEmit: () => tints[Math.floor(Math.random() * tints.length)] },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    this.jet.setDepth(9);

    if (fuel.smoke) {
      this.smoke = scene.add.particles(0, 0, 'orb', {
        speed: { min: 15, max: 55 },
        angle: { onEmit: () => Phaser.Math.RadToDeg(car.heading + Math.PI) + (Math.random() * 50 - 25) },
        scale: { start: 0.5, end: 1.5 },
        alpha: { start: 0.22, end: 0 },
        lifespan: { min: 450, max: 900 },
        frequency: 45,
        quantity: 1,
        tint: 0x9a9aa2,
        blendMode: Phaser.BlendModes.NORMAL,
        emitting: false,
      });
      this.smoke.setDepth(8);
    }
  }

  update(car: CarSim, rearOffset: number): void {
    const hot = car.alive && (car.boosting || car.overdriveTimer > 0);
    const idle = car.alive && Math.abs(car.speed) > 70;
    const rx = car.x - Math.cos(car.heading) * rearOffset;
    const ry = car.y - Math.sin(car.heading) * rearOffset;

    this.jet.setPosition(rx, ry);
    this.jet.emitting = hot || idle;
    this.jet.frequency = hot ? 14 : 55;

    if (this.smoke) {
      this.smoke.setPosition(rx, ry);
      this.smoke.emitting = hot || idle;
      this.smoke.frequency = hot ? 26 : 60;
    }
  }
}
