import Phaser from 'phaser';
import type { ArenaDef } from '../config/arenas';
import { PALETTE, hexToCss } from '../config/palette';
import { MIN_TRAIL } from '../game/CarSim';
import { bodyStyle, makePanel } from '../ui/widgets';
import { music } from '../game/music';
import { touchControls, resetTouchControls } from '../game/touchControls';
import type { ArenaScene } from './ArenaScene';

interface FeedEntry {
  text: Phaser.GameObjects.Text;
  expiresAt: number;
}

/**
 * Overlay scene: fuel gauge, score line, leaderboard, kill feed, minimap.
 * Everything is small, corner-anchored and translucent so the car stays
 * visible even when the camera clamps at arena walls and the car slides
 * toward a screen edge.
 */
export class HudScene extends Phaser.Scene {
  private arenaScene!: ArenaScene;
  private arenaDef!: ArenaDef;

  private fuelBar!: Phaser.GameObjects.Rectangle;
  private fuelLabel!: Phaser.GameObjects.Text;
  private trailBar!: Phaser.GameObjects.Rectangle;
  private scoreLine!: Phaser.GameObjects.Text;
  private boardText!: Phaser.GameObjects.Text;
  private feed: FeedEntry[] = [];
  private minimap!: Phaser.GameObjects.Graphics;
  private minimapSize = 110;
  private boardRows = 5;

  // Touch controls (snake.io scheme): steering wheel + hold-to-boost.
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

  constructor() {
    super('hud');
  }

  init(data: { arena: ArenaDef }): void {
    this.arenaDef = data.arena;
    this.feed = [];
  }

  create(): void {
    this.arenaScene = this.scene.get('arena') as ArenaScene;
    const w = this.scale.width;
    // On narrow (mobile) screens the corner panels must not collide.
    const narrow = w < 700;
    this.boardRows = narrow ? 3 : 5;
    this.minimapSize = narrow ? 84 : 110;

    // --- Top-left: fuel + trail bars + score line, one compact panel. ---
    makePanel(this, 116, 52, 212, 88, 0.45);
    this.add.text(20, 16, '⛽ FUEL', bodyStyle(10, hexToCss(PALETTE.uiDim)));
    this.add.rectangle(116, 34, 192, 10, 0x0a1020, 0.7).setStrokeStyle(1, PALETTE.uiPanelStroke);
    this.fuelBar = this.add.rectangle(22, 34, 188, 6, PALETTE.lime).setOrigin(0, 0.5);
    this.fuelLabel = this.add.text(178, 16, '', bodyStyle(10, hexToCss(PALETTE.uiDim)));

    this.add.text(20, 44, '🔥 NITRO TRAIL (boost burns it)', bodyStyle(9, hexToCss(PALETTE.uiDim)));
    this.add.rectangle(116, 61, 192, 8, 0x0a1020, 0.7).setStrokeStyle(1, PALETTE.uiPanelStroke);
    this.trailBar = this.add.rectangle(22, 61, 8, 5, PALETTE.amber).setOrigin(0, 0.5);

    this.scoreLine = this.add.text(20, 74, '', bodyStyle(13, hexToCss(PALETTE.cyan)));

    // --- Top-right: compact round leaderboard. ---
    const boardW = narrow ? 132 : 160;
    const boardH = narrow ? 76 : 112;
    makePanel(this, w - boardW / 2 - 8, 12 + boardH / 2, boardW, boardH, 0.4);
    this.add
      .text(w - boardW, 16, (this.arenaDef.night ? '🌙 ' : '') + this.arenaDef.name.slice(0, narrow ? 14 : 30), bodyStyle(narrow ? 9 : 10, hexToCss(PALETTE.gold)))
      .setOrigin(0, 0);
    this.boardText = this.add.text(w - boardW, 32, '', { ...bodyStyle(narrow ? 10 : 11), lineSpacing: 4 });

    // --- Bottom-right: minimap. ---
    const ms = this.minimapSize;
    makePanel(this, this.scale.width - ms / 2 - 14, this.scale.height - ms / 2 - 14, ms + 6, ms + 6, 0.4);
    this.minimap = this.add.graphics();

    // Kill feed events from the arena.
    this.arenaScene.events.on('killfeed', this.onKill, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.arenaScene.events.off('killfeed', this.onKill, this);
    });

    // Touch devices get the steering wheel + boost button.
    const touchDevice = this.sys.game.device.input.touch;
    if (touchDevice) this.buildTouchControls();

    // Controls hint, fades out quickly.
    const hintText = touchDevice
      ? 'Steer with the wheel · Hold 🔥 to boost'
      : 'Steer: mouse or WASD · Boost: hold click/SPACE · M: music';
    const hint = this.add
      .text(w / 2, this.scale.height - 32, hintText, bodyStyle(12, hexToCss(PALETTE.uiDim)))
      .setOrigin(0.5)
      .setAlpha(0.8);
    this.tweens.add({ targets: hint, alpha: 0, delay: 4000, duration: 1000 });
    this.input.keyboard?.on('keydown-M', () => music.toggleMute());
  }

  /** Snake.io-style thumb controls: wheel bottom-left, boost bottom-right. */
  private buildTouchControls(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.joyR = Phaser.Math.Clamp(Math.round(Math.min(w, h) * 0.14), 48, 68);
    this.joyX = this.joyR + 26;
    this.joyY = h - this.joyR - 26;

    this.add
      .image(this.joyX, this.joyY, 'wheel')
      .setDisplaySize(this.joyR * 2, this.joyR * 2)
      .setTint(PALETTE.cyan)
      .setAlpha(0.4)
      .setDepth(60);
    this.knob = this.add
      .image(this.joyX, this.joyY, 'knob')
      .setDisplaySize(this.joyR * 0.85, this.joyR * 0.85)
      .setAlpha(0.9)
      .setDepth(61);

    // Boost button sits above the minimap, right thumb territory.
    this.boostR = Math.round(this.joyR * 0.75);
    this.boostX = w - this.boostR - 30;
    this.boostY = h - this.minimapSize - this.boostR - 48;
    this.boostCircle = this.add
      .circle(this.boostX, this.boostY, this.boostR, 0xff5a1f, 0.3)
      .setStrokeStyle(3, PALETTE.amber, 0.9)
      .setDepth(60);
    this.add
      .text(this.boostX, this.boostY, '🔥', { fontSize: `${Math.round(this.boostR * 0.9)}px` })
      .setOrigin(0.5)
      .setDepth(61);

    this.input.on('pointerdown', this.onTouchDown, this);
    this.input.on('pointermove', this.onTouchMove, this);
    this.input.on('pointerup', this.onTouchUp, this);
    this.input.on('pointerupoutside', this.onTouchUp, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', this.onTouchDown, this);
      this.input.off('pointermove', this.onTouchMove, this);
      this.input.off('pointerup', this.onTouchUp, this);
      this.input.off('pointerupoutside', this.onTouchUp, this);
      resetTouchControls();
    });
  }

  private onTouchDown(p: Phaser.Input.Pointer): void {
    const dJoy = Phaser.Math.Distance.Between(p.x, p.y, this.joyX, this.joyY);
    if (this.joyId < 0 && dJoy <= this.joyR * 1.7) {
      this.joyId = p.id;
      this.updateKnob(p);
      return;
    }
    const dBoost = Phaser.Math.Distance.Between(p.x, p.y, this.boostX, this.boostY);
    if (this.boostId < 0 && this.boostCircle && dBoost <= this.boostR * 1.7) {
      this.boostId = p.id;
      touchControls.boostHeld = true;
      this.boostCircle.setFillStyle(0xff5a1f, 0.65).setScale(0.92);
    }
  }

  private onTouchMove(p: Phaser.Input.Pointer): void {
    if (p.id === this.joyId) this.updateKnob(p);
  }

  private onTouchUp(p: Phaser.Input.Pointer): void {
    if (p.id === this.joyId) {
      this.joyId = -1;
      touchControls.steering = false;
      if (this.knob) {
        this.tweens.add({ targets: this.knob, x: this.joyX, y: this.joyY, duration: 120, ease: 'Cubic.out' });
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

  private onKill(e: { killer: string; victim: string }): void {
    const entry = this.add.text(20, 0, `${e.killer} wrecked ${e.victim}`, {
      ...bodyStyle(11, hexToCss(PALETTE.magenta)),
      stroke: '#000',
      strokeThickness: 2,
    });
    this.feed.unshift({ text: entry, expiresAt: this.time.now + 4500 });
    if (this.feed.length > 3) this.feed.pop()?.text.destroy();
  }

  update(time: number): void {
    const player = this.arenaScene.player;
    if (!player) return;

    // Fuel.
    const frac = Phaser.Math.Clamp(player.fuel / player.stats.tank, 0, 1);
    this.fuelBar.width = 188 * frac;
    this.fuelBar.fillColor = frac < 0.2 ? PALETTE.red : frac < 0.45 ? PALETTE.amber : PALETTE.lime;
    if (frac < 0.2) this.fuelBar.setAlpha(0.5 + 0.5 * Math.abs(Math.sin(time / 120)));
    else this.fuelBar.setAlpha(1);
    this.fuelLabel.setText(`${Math.ceil(player.fuel)}`);

    // Trail (boost meter).
    const trailFrac = Phaser.Math.Clamp((player.trailLimit - MIN_TRAIL) / 150, 0, 1);
    this.trailBar.width = Math.max(2, 188 * trailFrac);

    // Score line.
    const alive = this.arenaScene.cars.filter((c) => c.alive).length;
    this.scoreLine.setText(
      player.alive
        ? `Score ${player.score}  ·  #${player.rank}/${alive}  ·  ${player.kills} wrecks`
        : 'WRECKED',
    );

    // Leaderboard.
    const top = [...this.arenaScene.cars]
      .filter((c) => c.alive)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.boardRows);
    this.boardText.setText(
      top
        .map((c, i) => {
          const marker = c === player ? '▶' : ' ';
          return `${marker}${i + 1}. ${c.driver.name.slice(0, 10).padEnd(10)} ${c.score}`;
        })
        .join('\n'),
    );

    // Kill feed positions + expiry.
    for (let i = this.feed.length - 1; i >= 0; i--) {
      const e = this.feed[i];
      e.text.setY(102 + i * 16);
      if (time > e.expiresAt) {
        e.text.destroy();
        this.feed.splice(i, 1);
      }
    }

    this.drawMinimap();
  }

  private drawMinimap(): void {
    const g = this.minimap;
    const ms = this.minimapSize;
    const x0 = this.scale.width - ms - 14 - 2;
    const y0 = this.scale.height - ms - 14 - 2;
    const worldScale = ms / (this.arenaDef.size || 4000);

    g.clear();
    g.fillStyle(0x0a1020, 0.35).fillRect(x0, y0, ms, ms);
    for (const car of this.arenaScene.cars) {
      if (!car.alive) continue;
      const isPlayer = car.driver.isPlayer;
      g.fillStyle(isPlayer ? PALETTE.cyan : PALETTE.magenta, 1);
      const r = isPlayer ? 3 : 1.8;
      g.fillCircle(x0 + car.x * worldScale, y0 + car.y * worldScale, r);
    }
  }
}
