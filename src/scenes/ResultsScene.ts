import Phaser from 'phaser';
import { arenaById } from '../config/arenas';
import { PALETTE, hexToCss } from '../config/palette';
import type { RunResult } from '../core/types';
import { sfx } from '../game/sfx';
import { refreshMissions, touchStreak, trackRun } from '../meta/Missions';
import { levelForXp } from '../meta/Progression';
import { loadSave, persistSave } from '../meta/SaveGame';
import { bodyStyle, clearScene, fitToScreen, formatMs, isNarrow, makeButton, makePanel, titleStyle } from '../ui/widgets';

export interface RaceResultData {
  position: number; // 0 = DNF
  totalCars: number;
  laps: number;
  lapsTotal: number;
  timeMs: number;
  pickups: number;
  trackId: string;
  trackName: string;
  rewards: { xp: number; scrap: number; stars: number };
  boostMs: number;
}

/** End-of-run screen (arena runs AND races). Banks rewards exactly once. */
export class ResultsScene extends Phaser.Scene {
  private result?: RunResult;
  private race?: RaceResultData;
  private boostMs = 0;
  private arenaId = 'city-day';
  private leveledUp = false;
  private newTrophies = 0;

  constructor() {
    super('results');
  }

  init(data: { result?: RunResult; boostMs?: number; arenaId?: string; race?: RaceResultData }): void {
    this.result = data.result;
    this.race = data.race;
    this.boostMs = data.boostMs ?? 0;
    this.arenaId = data.arenaId ?? 'city-day';
    if (this.race) this.bankRaceRewards();
    else this.bankRewards();
  }

  private bankRaceRewards(): void {
    const race = this.race!;
    const save = loadSave();
    const now = new Date();
    refreshMissions(save, now);
    touchStreak(save, now);

    const levelBefore = levelForXp(save.xp);
    save.xp += race.rewards.xp;
    save.scrap += race.rewards.scrap;
    save.trophies += race.rewards.stars;
    this.newTrophies = race.rewards.stars;
    this.leveledUp = levelForXp(save.xp) > levelBefore;

    trackRun(save, {
      orbsEaten: race.pickups,
      kills: 0,
      survivalMs: race.timeMs,
      boostMs: race.boostMs,
      scrapEarned: race.rewards.scrap,
      night: false,
      score: 0,
    });
    persistSave(save);
  }

  private bankRewards(): void {
    const result = this.result!;
    const save = loadSave();
    const now = new Date();
    refreshMissions(save, now);
    touchStreak(save, now);

    const levelBefore = levelForXp(save.xp);
    save.xp += result.xpEarned;
    save.scrap += result.scrapEarned;
    save.trophies += result.starsEarned;
    this.newTrophies = result.starsEarned;
    this.leveledUp = levelForXp(save.xp) > levelBefore;

    trackRun(save, {
      orbsEaten: result.orbsEaten,
      kills: result.kills,
      survivalMs: result.survivalMs,
      boostMs: this.boostMs,
      scrapEarned: result.scrapEarned,
      night: result.night,
      score: result.score,
    });

    save.bestRuns.push({
      score: result.score,
      kills: result.kills,
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

    let headline: string;
    let headlineColor: number;
    let subtitle = '';
    let starCount: number;
    let contextLine: string;
    let rows: [string, string][];
    let rewardLine: string;

    if (this.race) {
      const race = this.race;
      headline = race.position === 1 ? '🏆 VICTORY!' : race.position > 0 ? `FINISHED #${race.position}` : 'DNF!';
      headlineColor = race.position === 1 ? PALETTE.gold : race.position > 0 ? PALETTE.lime : PALETTE.red;
      subtitle = race.position > 0 ? '' : 'Out of fuel — grab more jerry cans next time';
      starCount = race.rewards.stars;
      contextLine = `+${this.newTrophies} trophies  ·  🏁 ${race.trackName}`;
      rows = [
        ['Position', race.position > 0 ? `${race.position} / ${race.totalCars}` : 'DNF'],
        ['Race time', formatMs(race.timeMs)],
        ['Laps', `${race.laps} / ${race.lapsTotal}`],
        ['Pickups grabbed', `${race.pickups}`],
        ['Nitro time', `${Math.round(race.boostMs / 1000)}s`],
      ];
      rewardLine = `+${race.rewards.xp} XP   ·   +${race.rewards.scrap} 🔩`;
    } else {
      const result = this.result!;
      const arena = arenaById(this.arenaId);
      headline =
        result.causeOfDeath === 'fuel'
          ? 'OUT OF FUEL!'
          : result.causeOfDeath === 'wall'
            ? 'WALL SLAM!'
            : result.causeOfDeath === 'hazard'
              ? 'ROAD KILL!'
              : 'WRECKED!';
      headlineColor = PALETTE.red;
      if (result.killedBy) subtitle = `${result.killedBy} claimed your scrap`;
      starCount = result.starsEarned;
      contextLine = `+${this.newTrophies} trophies  ·  ${arena.name}${arena.night ? ' 🌙' : ''}`;
      rows = [
        ['Score', `${result.score}`],
        ['Rivals wrecked', `${result.kills}`],
        ['Pickups collected', `${result.orbsEaten}`],
        ['Survived', formatMs(result.survivalMs)],
        ['Best rank', `#${result.bestRank}`],
      ];
      rewardLine =
        `+${result.xpEarned} XP   ·   +${result.scrapEarned} 🔩` + (arena.rewardMult > 1 ? `   (×${arena.rewardMult})` : '');
    }

    this.add.text(cx, 64, headline, titleStyle(narrow ? 38 : 48, hexToCss(headlineColor))).setOrigin(0.5);
    if (subtitle) {
      this.add.text(cx, 106, subtitle, bodyStyle(13, hexToCss(PALETTE.magenta))).setOrigin(0.5);
    }

    const stars = '★'.repeat(starCount) + '☆'.repeat(3 - starCount);
    this.add.text(cx, 148, stars, titleStyle(34, hexToCss(PALETTE.gold))).setOrigin(0.5);
    this.add.text(cx, 182, contextLine, bodyStyle(12, hexToCss(PALETTE.uiDim))).setOrigin(0.5);

    // Stats panel.
    const pw = narrow ? 380 : 400;
    makePanel(this, cx, 300, pw, 180);
    rows.forEach(([label, value], i) => {
      const y = 226 + i * 30;
      this.add.text(cx - pw / 2 + 22, y, label, bodyStyle(14, hexToCss(PALETTE.uiDim)));
      this.add.text(cx + pw / 2 - 22, y, value, bodyStyle(14)).setOrigin(1, 0);
    });

    this.add.text(cx, 414, rewardLine, bodyStyle(15, hexToCss(PALETTE.amber))).setOrigin(0.5);

    if (this.leveledUp) {
      const lvl = this.add
        .text(cx, 448, `⬆ LEVEL UP! Driver level ${levelForXp(loadSave().xp)}`, titleStyle(19, hexToCss(PALETTE.lime)))
        .setOrigin(0.5);
      this.tweens.add({ targets: lvl, scale: { from: 0.6, to: 1 }, duration: 400, ease: 'Back.out' });
    }

    const again = (): void => {
      if (this.race) this.scene.start('race', { trackId: this.race.trackId });
      else this.scene.start('arena', { arenaId: this.arenaId });
    };
    let DH: number;
    if (narrow) {
      makeButton(this, cx, 512, 340, 56, '↻ RACE AGAIN', again, PALETTE.lime);
      makeButton(this, cx, 574, 340, 44, '🔧 GARAGE', () => this.scene.start('garage'));
      makeButton(this, cx, 628, 340, 40, 'MENU', () => this.scene.start('menu'));
      DH = 680;
    } else {
      makeButton(this, cx - 190, 512, 220, 54, '↻ RACE AGAIN', again, PALETTE.lime);
      makeButton(this, cx + 10, 512, 160, 54, '🔧 GARAGE', () => this.scene.start('garage'));
      makeButton(this, cx + 185, 512, 160, 54, 'MENU', () => this.scene.start('menu'));
      DH = 560;
    }

    fitToScreen(this, start, DW, DH);
  }
}
