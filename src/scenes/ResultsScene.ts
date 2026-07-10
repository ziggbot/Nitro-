import Phaser from 'phaser';
import { arenaById } from '../config/arenas';
import { PALETTE, hexToCss } from '../config/palette';
import type { RunResult } from '../core/types';
import { sfx } from '../game/sfx';
import { refreshMissions, touchStreak, trackRun } from '../meta/Missions';
import { levelForXp } from '../meta/Progression';
import { loadSave, persistSave } from '../meta/SaveGame';
import { bodyStyle, formatMs, makeButton, makePanel, titleStyle } from '../ui/widgets';

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

    // Personal-best board.
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
    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w / 2;
    const arena = arenaById(this.arenaId);

    this.add.rectangle(cx, h / 2, w, h, PALETTE.deepSpace, 0.96);

    const headline =
      this.result.causeOfDeath === 'fuel'
        ? 'OUT OF FUEL!'
        : this.result.causeOfDeath === 'wall'
          ? 'WALL SLAM!'
          : this.result.causeOfDeath === 'hazard'
            ? 'ROAD KILL!'
            : 'WRECKED!';
    this.add.text(cx, 70, headline, titleStyle(52, hexToCss(PALETTE.red))).setOrigin(0.5);
    if (this.result.killedBy) {
      this.add
        .text(cx, 118, `${this.result.killedBy} claimed your scrap`, bodyStyle(15, hexToCss(PALETTE.magenta)))
        .setOrigin(0.5);
    }

    // Stars.
    const stars = '★'.repeat(this.result.starsEarned) + '☆'.repeat(3 - this.result.starsEarned);
    this.add.text(cx, 158, stars, titleStyle(38, hexToCss(PALETTE.gold))).setOrigin(0.5);
    this.add
      .text(cx, 196, `+${this.newTrophies} trophies  ·  ${arena.name}${arena.night ? ' 🌙' : ''}`, bodyStyle(13, hexToCss(PALETTE.uiDim)))
      .setOrigin(0.5);

    // Stats panel.
    makePanel(this, cx, 310, 380, 180);
    const rows: [string, string][] = [
      ['Score', `${this.result.score}`],
      ['Rivals wrecked', `${this.result.kills}`],
      ['Orbs collected', `${this.result.orbsEaten}`],
      ['Survived', formatMs(this.result.survivalMs)],
      ['Best rank', `#${this.result.bestRank}`],
    ];
    rows.forEach(([label, value], i) => {
      const y = 240 + i * 28;
      this.add.text(cx - 170, y, label, bodyStyle(15, hexToCss(PALETTE.uiDim)));
      this.add.text(cx + 170, y, value, bodyStyle(15)).setOrigin(1, 0);
    });

    // Rewards.
    this.add
      .text(
        cx,
        424,
        `+${this.result.xpEarned} XP   ·   +${this.result.scrapEarned} 🔩 scrap` +
          (arena.rewardMult > 1 ? `   (×${arena.rewardMult} arena bonus)` : ''),
        bodyStyle(17, hexToCss(PALETTE.amber)),
      )
      .setOrigin(0.5);

    if (this.leveledUp) {
      const lvl = this.add
        .text(cx, 458, `⬆ LEVEL UP! Driver level ${levelForXp(loadSave().xp)}`, titleStyle(22, hexToCss(PALETTE.lime)))
        .setOrigin(0.5);
      this.tweens.add({ targets: lvl, scale: { from: 0.6, to: 1 }, duration: 400, ease: 'Back.out' });
      sfx.levelUp();
    }

    makeButton(this, cx - 150, h - 70, 200, 52, '↻ RACE AGAIN', () => this.scene.start('arena', { arenaId: this.arenaId }), PALETTE.lime);
    makeButton(this, cx + 60, h - 70, 160, 52, '🔧 GARAGE', () => this.scene.start('garage'));
    makeButton(this, cx + 240, h - 70, 140, 52, 'MENU', () => this.scene.start('menu'));
  }
}
