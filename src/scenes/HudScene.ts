import Phaser from 'phaser';
import type { ArenaDef } from '../config/arenas';
import { PALETTE, hexToCss } from '../config/palette';
import { MIN_TRAIL } from '../game/CarSim';
import { bodyStyle, makePanel, FONTS } from '../ui/widgets';
import type { ArenaScene } from './ArenaScene';

interface FeedEntry {
  text: Phaser.GameObjects.Text;
  expiresAt: number;
}

/** Overlay scene: fuel gauge, score/rank, leaderboard, kill feed, minimap. */
export class HudScene extends Phaser.Scene {
  private arenaScene!: ArenaScene;
  private arenaDef!: ArenaDef;

  private fuelBar!: Phaser.GameObjects.Rectangle;
  private fuelLabel!: Phaser.GameObjects.Text;
  private trailBar!: Phaser.GameObjects.Rectangle;
  private scoreText!: Phaser.GameObjects.Text;
  private rankText!: Phaser.GameObjects.Text;
  private boardText!: Phaser.GameObjects.Text;
  private feed: FeedEntry[] = [];
  private minimap!: Phaser.GameObjects.Graphics;
  private minimapSize = 130;

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

    // --- Top-left: fuel + trail bars. ---
    makePanel(this, 120, 44, 220, 68, 0.6);
    this.add.text(24, 20, '⛽ FUEL', bodyStyle(12, hexToCss(PALETTE.uiDim))).setDepth(1);
    this.add.rectangle(120, 44, 196, 12, 0x0a1020).setStrokeStyle(1, PALETTE.uiPanelStroke);
    this.fuelBar = this.add.rectangle(24, 44, 192, 8, PALETTE.lime).setOrigin(0, 0.5);
    this.fuelLabel = this.add.text(190, 20, '', bodyStyle(12));

    this.add.text(24, 56, '🔥 NITRO TRAIL (boost burns it)', bodyStyle(11, hexToCss(PALETTE.uiDim)));
    this.add.rectangle(120, 72, 196, 10, 0x0a1020).setStrokeStyle(1, PALETTE.uiPanelStroke);
    this.trailBar = this.add.rectangle(24, 72, 10, 6, PALETTE.amber).setOrigin(0, 0.5);

    // --- Top-center: score + rank. ---
    this.scoreText = this.add
      .text(w / 2, 18, 'SCORE 0', { fontFamily: FONTS.title, fontSize: '26px', color: hexToCss(PALETTE.cyan), stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5, 0);
    this.rankText = this.add
      .text(w / 2, 48, '', bodyStyle(14, hexToCss(PALETTE.uiDim)))
      .setOrigin(0.5, 0);

    // --- Top-right: round leaderboard. ---
    makePanel(this, w - 110, 84, 200, 148, 0.6);
    this.add
      .text(w - 200, 20, this.arenaDef.night ? '🌙 ' + this.arenaDef.name : this.arenaDef.name, bodyStyle(12, hexToCss(PALETTE.gold)))
      .setOrigin(0, 0);
    this.boardText = this.add.text(w - 200, 38, '', {
      ...bodyStyle(13),
      lineSpacing: 5,
    });

    // --- Bottom-right: minimap. ---
    const ms = this.minimapSize;
    makePanel(this, this.scale.width - ms / 2 - 16, this.scale.height - ms / 2 - 16, ms + 8, ms + 8, 0.55);
    this.minimap = this.add.graphics();

    // Kill feed events from the arena.
    this.arenaScene.events.on('killfeed', this.onKill, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.arenaScene.events.off('killfeed', this.onKill, this);
    });

    // Controls hint, fades out.
    const hint = this.add
      .text(w / 2, this.scale.height - 40, 'Steer with mouse/touch or WASD — hold click/SPACE to boost', bodyStyle(14, hexToCss(PALETTE.uiDim)))
      .setOrigin(0.5);
    this.tweens.add({ targets: hint, alpha: 0, delay: 6000, duration: 1200 });
  }

  private onKill(e: { killer: string; victim: string }): void {
    const entry = this.add.text(24, 0, `${e.killer} wrecked ${e.victim}`, {
      ...bodyStyle(13, hexToCss(PALETTE.magenta)),
      stroke: '#000',
      strokeThickness: 3,
    });
    this.feed.unshift({ text: entry, expiresAt: this.time.now + 5000 });
    if (this.feed.length > 4) this.feed.pop()?.text.destroy();
  }

  update(time: number): void {
    const player = this.arenaScene.player;
    if (!player) return;

    // Fuel.
    const frac = Phaser.Math.Clamp(player.fuel / player.stats.tank, 0, 1);
    this.fuelBar.width = 192 * frac;
    this.fuelBar.fillColor = frac < 0.2 ? PALETTE.red : frac < 0.45 ? PALETTE.amber : PALETTE.lime;
    if (frac < 0.2) this.fuelBar.setAlpha(0.5 + 0.5 * Math.abs(Math.sin(time / 120)));
    else this.fuelBar.setAlpha(1);
    this.fuelLabel.setText(`${Math.ceil(player.fuel)}`);

    // Trail (boost meter).
    const trailFrac = Phaser.Math.Clamp((player.trailLimit - MIN_TRAIL) / 150, 0, 1);
    this.trailBar.width = Math.max(2, 192 * trailFrac);

    // Score + rank.
    this.scoreText.setText(`SCORE ${player.score}`);
    const alive = this.arenaScene.cars.filter((c) => c.alive).length;
    this.rankText.setText(player.alive ? `#${player.rank} of ${alive}  ·  ${player.kills} wrecks` : 'WRECKED');

    // Leaderboard top 5.
    const top = [...this.arenaScene.cars]
      .filter((c) => c.alive)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    this.boardText.setText(
      top
        .map((c, i) => {
          const marker = c === player ? '▶' : ' ';
          return `${marker}${i + 1}. ${c.driver.name.slice(0, 14).padEnd(14)} ${c.score}`;
        })
        .join('\n'),
    );

    // Kill feed positions + expiry.
    for (let i = this.feed.length - 1; i >= 0; i--) {
      const e = this.feed[i];
      e.text.setY(96 + i * 20);
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
    const x0 = this.scale.width - ms - 16 - 2;
    const y0 = this.scale.height - ms - 16 - 2;
    const scale = ms / this.arenaScene.cars.length; // placeholder, replaced below
    void scale;
    const worldScale = ms / (this.arenaDef.size || 4000);

    g.clear();
    g.fillStyle(0x0a1020, 0.4).fillRect(x0, y0, ms, ms);
    for (const car of this.arenaScene.cars) {
      if (!car.alive) continue;
      const isPlayer = car.driver.isPlayer;
      g.fillStyle(isPlayer ? PALETTE.cyan : PALETTE.magenta, 1);
      const r = isPlayer ? 3.5 : 2;
      g.fillCircle(x0 + car.x * worldScale, y0 + car.y * worldScale, r);
    }
  }
}
