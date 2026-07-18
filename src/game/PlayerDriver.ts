import Phaser from 'phaser';
import type { Driver, DriverInput } from '../core/types';
import type { CarSim } from './CarSim';
import { touchControls } from './touchControls';

/**
 * Local player input: .io-style pointer steering (car chases the pointer,
 * hold to boost) plus classic WASD/arrow keys. Works for desktop and touch.
 */
export class PlayerDriver implements Driver {
  readonly isPlayer = true;
  car!: CarSim;

  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys: Record<'W' | 'A' | 'S' | 'D' | 'SPACE', Phaser.Input.Keyboard.Key>;
  private pointerSteering = false;

  constructor(
    private scene: Phaser.Scene,
    public readonly name: string,
  ) {
    const kb = scene.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keys = {
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      SPACE: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
    };
    // Any pointer movement switches to pointer steering; keys switch back.
    scene.input.on('pointermove', () => (this.pointerSteering = true));
    scene.input.on('pointerdown', () => (this.pointerSteering = true));
  }

  getInput(_dt: number): DriverInput {
    // Steering wheel (touch joystick) wins over everything else.
    if (touchControls.steering && this.car) {
      this.pointerSteering = false;
      let diff = touchControls.angle - this.car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      return {
        steer: Phaser.Math.Clamp(diff * 3.5, -1, 1),
        throttle: 1,
        boost: touchControls.boostHeld || this.keys.SPACE.isDown,
      };
    }

    const left = this.cursors.left.isDown || this.keys.A.isDown;
    const right = this.cursors.right.isDown || this.keys.D.isDown;
    const up = this.cursors.up.isDown || this.keys.W.isDown;
    const down = this.cursors.down.isDown || this.keys.S.isDown;
    const anyKey = left || right || up || down;
    if (anyKey) this.pointerSteering = false;

    if (this.pointerSteering && this.car) {
      const pointer = this.scene.input.activePointer;
      const world = pointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2;
      const desired = Math.atan2(world.y - this.car.y, world.x - this.car.x);
      let diff = desired - this.car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const dist = Phaser.Math.Distance.Between(world.x, world.y, this.car.x, this.car.y);
      return {
        steer: Phaser.Math.Clamp(diff * 3.5, -1, 1),
        // Pointer very close to the car = ease off, .io style.
        throttle: dist < 40 ? 0.2 : 1,
        boost: pointer.isDown || this.keys.SPACE.isDown || touchControls.boostHeld,
      };
    }

    return {
      steer: (left ? -1 : 0) + (right ? 1 : 0),
      throttle: down ? 0.25 : up ? 1 : 0.62,
      boost: this.keys.SPACE.isDown || touchControls.boostHeld,
    };
  }
}
