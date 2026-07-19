import Phaser from 'phaser';
import type { TrackDef } from '../config/tracks';
import { PALETTE, hexToCss } from '../config/palette';
import { music } from '../game/music';
import type { RacePath } from '../game/racePath';
import { bodyStyle, formatMs, makeExitButton, makePanel, FONTS } from '../ui/widgets';
import { TouchControlsOverlay } from '../ui/TouchControlsOverlay';
import type { RaceScene } from './RaceScene';

/** Race overlay: position, lap, time, fuel and a track-shaped minimap. */
export class RaceHudScene extends Phaser.Scene {
  private raceScene!: RaceScene;
  private track!: TrackDef;
  private path!: RacePath;

  private fuelBar!: Phaser.GameObjects.Rectangle;
  private ammoText?: Phaser.GameObjects.Text;
  private posText!: Phaser.GameObjects.Text;
  private lapText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private minimap!: Phaser.GameObjects.Graphics;
  private mapSize = 120;
  private mapScale = 1;

  constructor() {
    super('racehud');
  }

  init(data: { track: TrackDef; path: RacePath }): void {
    this.track = data.track;
    this.path = data.path;
  }

  create(): void {
    this.raceScene = this.scene.get('race') as RaceScene;
    const w = this.scale.width;
    const narrow = w < 700;
    this.mapSize = narrow ? 96 : 130;
    this.mapScale = this.mapSize / this.track.size;

    // Top-left: fuel.
    makePanel(this, 110, 34, 200, 52, 0.45);
    this.add.text(18, 14, '⛽ FUEL', bodyStyle(10, hexToCss(PALETTE.uiDim)));
    this.add.rectangle(110, 36, 180, 12, 0x0a1020, 0.7).setStrokeStyle(1, PALETTE.uiPanelStroke);
    this.fuelBar = this.add.rectangle(21, 36, 176, 8, PALETTE.lime).setOrigin(0, 0.5);

    // Quit the race (DNF) — reachable on touch devices. On narrow screens the
    // top-center POS text reaches x≈232, so tuck the button under the clock.
    if (narrow) makeExitButton(this, w - 26, 60, () => this.raceScene.quitRace());
    else makeExitButton(this, 232, 26, () => this.raceScene.quitRace());

    // Ammo counter, under the fuel panel (weapons on only).
    if (this.raceScene.shootingOn) {
      this.ammoText = this.add.text(18, 66, '', bodyStyle(14, hexToCss(PALETTE.amber))).setStroke('#000', 3);
    }

    // Top-center: position + lap, big retro numbers.
    this.posText = this.add
      .text(w / 2, 12, '', { fontFamily: FONTS.title, fontSize: narrow ? '26px' : '32px', color: hexToCss(PALETTE.cyan), stroke: '#000', strokeThickness: 5 })
      .setOrigin(0.5, 0);
    this.lapText = this.add
      .text(w / 2, narrow ? 42 : 50, '', bodyStyle(14, hexToCss(PALETTE.gold)))
      .setOrigin(0.5, 0);

    // Top-right: race time.
    this.timeText = this.add
      .text(w - 16, 16, '0:00', { fontFamily: FONTS.mono, fontSize: '18px', color: hexToCss(PALETTE.uiText), stroke: '#000', strokeThickness: 3 })
      .setOrigin(1, 0);

    // Bottom-right: track minimap.
    makePanel(this, w - this.mapSize / 2 - 14, this.scale.height - this.mapSize / 2 - 14, this.mapSize + 8, this.mapSize + 8, 0.4);
    this.minimap = this.add.graphics();

    new TouchControlsOverlay(this, this.mapSize, this.raceScene.shootingOn).build();

    // Lap + blackout banners.
    this.raceScene.events.on('lap', this.onLap, this);
    this.raceScene.events.on('blackout', this.onBlackout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.raceScene.events.off('lap', this.onLap, this);
      this.raceScene.events.off('blackout', this.onBlackout, this);
    });
    this.input.keyboard?.on('keydown-M', () => music.toggleMute());
  }

  private onLap(lap: number): void {
    const last = lap === this.raceScene.lapsTotal - 1;
    const banner = this.add
      .text(this.scale.width / 2, this.scale.height * 0.3, last ? 'FINAL LAP!' : `LAP ${lap + 1}`, {
        fontFamily: FONTS.title,
        fontSize: '44px',
        color: hexToCss(last ? PALETTE.red : PALETTE.lime),
        stroke: '#000',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(70);
    this.tweens.add({ targets: banner, alpha: 0, y: banner.y - 40, duration: 1400, ease: 'Cubic.out', onComplete: () => banner.destroy() });
  }

  private onBlackout(): void {
    const banner = this.add
      .text(this.scale.width / 2, this.scale.height * 0.26, '⚡ BLACKOUT!', {
        fontFamily: FONTS.title,
        fontSize: '40px',
        color: hexToCss(PALETTE.violet),
        stroke: '#000',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(70);
    this.tweens.add({ targets: banner, alpha: 0, y: banner.y - 34, duration: 1300, ease: 'Cubic.out', onComplete: () => banner.destroy() });
  }

  update(time: number): void {
    const player = this.raceScene.player;
    if (!player) return;
    const car = player.car;

    const frac = Phaser.Math.Clamp(car.fuel / car.stats.tank, 0, 1);
    this.fuelBar.width = 176 * frac;
    this.fuelBar.fillColor = frac < 0.2 ? PALETTE.red : frac < 0.45 ? PALETTE.amber : PALETTE.lime;
    if (frac < 0.2) this.fuelBar.setAlpha(0.5 + 0.5 * Math.abs(Math.sin(time / 120)));
    else this.fuelBar.setAlpha(1);

    this.ammoText?.setText(`💥 AMMO ×${this.raceScene.playerAmmo}`);

    this.posText.setText(`POS ${this.raceScene.position(player)}/${this.raceScene.racers.length}`);
    this.lapText.setText(`LAP ${Math.min(this.raceScene.lapsTotal, player.tracker.lap + 1)}/${this.raceScene.lapsTotal}`);
    this.timeText.setText(formatMs(this.raceScene.raceTimeMs));

    // Minimap: track outline + car dots.
    const g = this.minimap;
    const x0 = this.scale.width - this.mapSize - 14 - 2;
    const y0 = this.scale.height - this.mapSize - 14 - 2;
    g.clear();
    g.lineStyle(2, 0x3a3a6c, 0.9);
    g.beginPath();
    const pts = this.path.pts;
    g.moveTo(x0 + pts[0].x * this.mapScale, y0 + pts[0].y * this.mapScale);
    for (let i = 4; i < pts.length; i += 4) g.lineTo(x0 + pts[i].x * this.mapScale, y0 + pts[i].y * this.mapScale);
    g.closePath();
    g.strokePath();
    for (const entry of this.raceScene.racers) {
      const isPlayer = entry === player;
      g.fillStyle(isPlayer ? PALETTE.cyan : PALETTE.magenta, 1);
      g.fillCircle(x0 + entry.car.x * this.mapScale, y0 + entry.car.y * this.mapScale, isPlayer ? 3.5 : 2);
    }
  }
}
