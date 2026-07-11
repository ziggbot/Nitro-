import Phaser from 'phaser';
import { arenaById } from '../config/arenas';
import { PALETTE, hexToCss } from '../config/palette';
import type { RunResult } from '../core/types';
import { sfx } from '../game/sfx';
import { refreshMissions, touchStreak, trackRun } from '../meta/Missions';
import { levelForXp } from '../meta/Progression';
import { loadSave, persistSave } from '../meta/SaveGame';
import { bodyStyle, clearScene, fitToScreen, formatMs, isNarrow, makeButton, makePanel, titleStyle } from '../ui/widgets';

/** End-of-run screen. Banks rewards into the save exactly once. */
export class ResultsScene extends Phaser.Scene {
  private result!: RunResult;
  private boostMs = 0;
  private arenaId = 'city-day';
  private leveledUp = false;
  private newTrophies = 0;

  constructor() {
    super('results');
  }

  init(data: { result: RunResult; boostMs: number; arenaId: string }): void {
    this.result = data.result;
    this.boostMs = data.boostMs;
    this.arenaId = data.arenaId;
    this.bankRewards();
  }

  private bankRewards(): void {
    const save = loadSave();
    const now = new Date();
    refreshMissions(save, now);
    touchStreak(save, now);

    const levelBefore = levelForXp(save.xp);
    save.xp += this.result.xpEarned;
    save.scrap += this.result.scrapEarned;
    save.trophies += this.result.starsEarned;
    this.newTrophies = this.result.starsEarned;
    this.leveledUp = levelForXp(save.xp) > levelBefore;

    trackRun(save, {
      orbsEaten: this.result.orbsEaten,
      kills: this.result.kills,
      survivalMs: this.result.survivalMs,
      boostMs: this.boostMs,
      scrapEarned: this.result.scrapEarned,
      night: this.result.night,
      score: this.result.score,
    });

    save.bestRuns.push({
      score: this.result.score,
      kills: this.result.kills,
      arena: this.arenaId,
      date: now.toISOString().slice(0, 10),
    });
    save.bestRuns.sort((a, b) => b.score - a.score);
    save.bestRuns = save.bestRuns.slice(0, 5);

    persistSave(save);
  }

  create(): void {
    this.buildUi();
    this.scale.on('resize', this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.onResize, this);
    });
    if (this.leveledUp) sfx.levelUp();
  }

  private onResize(): void {
    this.buildUi();
  }

  private buildUi(): void {
    clearScene(this);
    const w = this.scale.width;
    const h = this.scale.height;
    this.add.rectangle(w / 2, h / 2, w, h, PALETTE.deepSpace, 0.96);

    const start = this.children.list.length;
    const narrow = isNarrow(this);
    const DW = narrow ? 420 : 960;
    const cx = DW / 2;
    const arena = arenaById(this.arenaId);

    const headline =
      this.result.causeOfDeath === 'fuel'
        ? 'OUT OF FUEL!'
        : this.result.causeOfDeath === 'wall'
          ? 'WALL SLAM!'
          : this.result.causeOfDeath === 'hazard'
            ? 'ROAD KILL!'
            : 'WRECKED!';
    this.add.text(cx, 64, headline, titleStyle(narrow ? 38 : 48, hexToCss(PALETTE.red))).setOrigin(0.5);
    if (this.result.killedBy) {
      this.add
        .text(cx, 106, `${this.result.killedBy} claimed your scrap`, bodyStyle(13, hexToCss(PALETTE.magenta)))
        .setOrigin(0.5);
    }

    const stars = '★'.repeat(this.result.starsEarned) + '☆'.repeat(3 - this.result.starsEarned);
    this.add.text(cx, 148, stars, titleStyle(34, hexToCss(PALETTE.gold))).setOrigin(0.5);
    this.add
      .text(cx, 182, `+${this.newTrophies} trophies  ·  ${arena.name}${arena.night ? ' 🌙' : ''}`, bodyStyle(12, hexToCss(PALETTE.uiDim)))
      .setOrigin(0.5);

    // Stats panel.
    const pw = narrow ? 380 : 400;
    makePanel(this, cx, 300, pw, 180);
    const rows: [string, string][] = [
      ['Score', `${this.result.score}`],
      ['Rivals wrecked', `${this.result.kills}`],
      ['Pickups collected', `${this.result.orbsEaten}`],
      ['Survived', formatMs(this.result.survivalMs)],
      ['Best rank', `#${this.result.bestRank}`],
    ];
    rows.forEach(([label, value], i) => {
      const y = 226 + i * 30;
      this.add.text(cx - pw / 2 + 22, y, label, bodyStyle(14, hexToCss(PALETTE.uiDim)));
      this.add.text(cx + pw / 2 - 22, y, value, bodyStyle(14)).setOrigin(1, 0);
    });

    this.add
      .text(
        cx,
        414,
        `+${this.result.xpEarned} XP   ·   +${this.result.scrapEarned} 🔩` + (arena.rewardMult > 1 ? `   (×${arena.rewardMult})` : ''),
        bodyStyle(15, hexToCss(PALETTE.amber)),
      )
      .setOrigin(0.5);

    if (this.leveledUp) {
      const lvl = this.add
        .text(cx, 448, `⬆ LEVEL UP! Driver level ${levelForXp(loadSave().xp)}`, titleStyle(19, hexToCss(PALETTE.lime)))
        .setOrigin(0.5);
      this.tweens.add({ targets: lvl, scale: { from: 0.6, to: 1 }, duration: 400, ease: 'Back.out' });
    }

    let DH: number;
    if (narrow) {
      makeButton(this, cx, 512, 340, 56, '↻ RACE AGAIN', () => this.scene.start('arena', { arenaId: this.arenaId }), PALETTE.lime);
      makeButton(this, cx, 574, 340, 44, '🔧 GARAGE', () => this.scene.start('garage'));
      makeButton(this, cx, 628, 340, 40, 'MENU', () => this.scene.start('menu'));
      DH = 680;
    } else {
      makeButton(this, cx - 190, 512, 220, 54, '↻ RACE AGAIN', () => this.scene.start('arena', { arenaId: this.arenaId }), PALETTE.lime);
      makeButton(this, cx + 10, 512, 160, 54, '🔧 GARAGE', () => this.scene.start('garage'));
      makeButton(this, cx + 185, 512, 160, 54, 'MENU', () => this.scene.start('menu'));
      DH = 560;
    }

    fitToScreen(this, start, DW, DH);
  }
}
