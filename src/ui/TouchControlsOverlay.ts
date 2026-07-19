import Phaser from 'phaser';
import { PALETTE } from '../config/palette';
import { touchControls, resetTouchControls } from '../game/touchControls';

/**
 * Snake.io-style thumb controls, shared by the arena and race HUDs:
 * steering-wheel joystick bottom-left, hold-to-boost button bottom-right.
 * Only builds on touch devices; cleans itself up on scene shutdown.
 */
export class TouchControlsOverlay {
  private joyId = -1;
  private boostId = -1;
  private joyX = 0;
  private joyY = 0;
  private joyR = 56;
  private knob?: Phaser.GameObjects.Image;
  private boostX = 0;
  private boostY = 0;
  private boostR = 40;
  private boostCircle?: Phaser.GameObjects.Arc;
  private fireX = 0;
  private fireY = 0;
  private fireR = 0;
  private fireCircle?: Phaser.GameObjects.Arc;

  constructor(
    private scene: Phaser.Scene,
    /** Height reserved bottom-right (e.g. minimap) that boost sits above. */
    private bottomRightReserved = 0,
    /** Adds a tap-to-fire button above boost (race mode with weapons on). */
    private withFire = false,
  ) {}

  /** Returns true if controls were built (touch device). */
  build(): boolean {
    const scene = this.scene;
    if (!scene.sys.game.device.input.touch) return false;
    const w = scene.scale.width;
    const h = scene.scale.height;

    this.joyR = Phaser.Math.Clamp(Math.round(Math.min(w, h) * 0.14), 48, 68);
    this.joyX = this.joyR + 26;
    this.joyY = h - this.joyR - 26;

    scene.add
      .image(this.joyX, this.joyY, 'wheel')
      .setDisplaySize(this.joyR * 2, this.joyR * 2)
      .setTint(PALETTE.cyan)
      .setAlpha(0.4)
      .setDepth(60);
    this.knob = scene.add
      .image(this.joyX, this.joyY, 'knob')
      .setDisplaySize(this.joyR * 0.85, this.joyR * 0.85)
      .setAlpha(0.9)
      .setDepth(61);

    this.boostR = Math.round(this.joyR * 0.75);
    this.boostX = w - this.boostR - 30;
    this.boostY = h - this.bottomRightReserved - this.boostR - 48;
    this.boostCircle = scene.add
      .circle(this.boostX, this.boostY, this.boostR, 0xff5a1f, 0.3)
      .setStrokeStyle(3, PALETTE.amber, 0.9)
      .setDepth(60);
    scene.add
      .text(this.boostX, this.boostY, '🔥', { fontSize: `${Math.round(this.boostR * 0.9)}px` })
      .setOrigin(0.5)
      .setDepth(61);

    if (this.withFire) {
      this.fireR = Math.round(this.boostR * 0.8);
      this.fireX = this.boostX;
      this.fireY = this.boostY - this.boostR - this.fireR - 22;
      this.fireCircle = scene.add
        .circle(this.fireX, this.fireY, this.fireR, 0xffb31f, 0.28)
        .setStrokeStyle(3, PALETTE.red, 0.9)
        .setDepth(60);
      scene.add
        .text(this.fireX, this.fireY, '💥', { fontSize: `${Math.round(this.fireR * 0.9)}px` })
        .setOrigin(0.5)
        .setDepth(61);
    }

    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.off('pointerdown', this.onDown, this);
      scene.input.off('pointermove', this.onMove, this);
      scene.input.off('pointerup', this.onUp, this);
      scene.input.off('pointerupoutside', this.onUp, this);
      resetTouchControls();
    });
    return true;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    const dJoy = Phaser.Math.Distance.Between(p.x, p.y, this.joyX, this.joyY);
    if (this.joyId < 0 && dJoy <= this.joyR * 1.7) {
      this.joyId = p.id;
      this.updateKnob(p);
      return;
    }
    if (this.fireCircle) {
      const dFire = Phaser.Math.Distance.Between(p.x, p.y, this.fireX, this.fireY);
      if (dFire <= this.fireR * 1.4) {
        touchControls.firePressed = true;
        this.fireCircle.setFillStyle(0xffb31f, 0.65).setScale(0.9);
        this.scene.tweens.add({ targets: this.fireCircle, scale: 1, duration: 180, onComplete: () => this.fireCircle?.setFillStyle(0xffb31f, 0.28) });
        return;
      }
    }
    const dBoost = Phaser.Math.Distance.Between(p.x, p.y, this.boostX, this.boostY);
    if (this.boostId < 0 && this.boostCircle && dBoost <= this.boostR * 1.7) {
      this.boostId = p.id;
      touchControls.boostHeld = true;
      this.boostCircle.setFillStyle(0xff5a1f, 0.65).setScale(0.92);
    }
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id === this.joyId) this.updateKnob(p);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id === this.joyId) {
      this.joyId = -1;
      touchControls.steering = false;
      if (this.knob) {
        this.scene.tweens.add({ targets: this.knob, x: this.joyX, y: this.joyY, duration: 120, ease: 'Cubic.out' });
      }
    }
    if (p.id === this.boostId) {
      this.boostId = -1;
      touchControls.boostHeld = false;
      this.boostCircle?.setFillStyle(0xff5a1f, 0.3).setScale(1);
    }
  }

  private updateKnob(p: Phaser.Input.Pointer): void {
    const dx = p.x - this.joyX;
    const dy = p.y - this.joyY;
    const len = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const d = Math.min(len, this.joyR * 0.72);
    this.knob?.setPosition(this.joyX + Math.cos(angle) * d, this.joyY + Math.sin(angle) * d);
    // A tiny dead zone so a resting thumb doesn't twitch the car.
    if (len > 8) {
      touchControls.steering = true;
      touchControls.angle = angle;
    }
  }
}
