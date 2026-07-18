import Phaser from 'phaser';
import type { ArenaDef } from '../config/arenas';
import { PALETTE, hexToCss } from '../config/palette';
import { MIN_TRAIL } from '../game/CarSim';
import { bodyStyle, makeExitButton, makePanel } from '../ui/widgets';
import { music } from '../game/music';
import { TouchControlsOverlay } from '../ui/TouchControlsOverlay';
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

    // Quit to results/menu (banks the run) — vital on touch where ESC doesn't exist.
    makeExitButton(this, 244, 26, () => this.arenaScene.quitRun());

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
    const touchDevice = new TouchControlsOverlay(this, this.minimapSize).build();

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
