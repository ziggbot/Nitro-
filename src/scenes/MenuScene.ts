import Phaser from 'phaser';
import { ARENAS } from '../config/arenas';
import { PALETTE, hexToCss } from '../config/palette';
import { sfx } from '../game/sfx';
import { claimMission, missionDef, refreshMissions } from '../meta/Missions';
import { levelForXp, xpProgress } from '../meta/Progression';
import { loadSave, persistSave, type SaveData } from '../meta/SaveGame';
import { unlockedArenas } from '../meta/Unlocks';
import { bodyStyle, makeButton, makePanel, titleStyle } from '../ui/widgets';

export class MenuScene extends Phaser.Scene {
  private save!: SaveData;
  private arenaIndex = 0;

  constructor() {
    super('menu');
  }

  create(): void {
    this.save = loadSave();
    refreshMissions(this.save, new Date());
    persistSave(this.save);

    this.arenaIndex = Math.max(0, ARENAS.findIndex((a) => a.id === this.save.selectedArena));
    this.buildUi();
  }

  private buildUi(): void {
    this.children.removeAll();
    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w / 2;

    this.add.rectangle(cx, h / 2, w, h, PALETTE.deepSpace);
    // Decorative grid horizon.
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x28285a, 0.5);
    for (let i = 0; i < 20; i++) {
      grid.lineBetween(0, h * 0.55 + i * i * 2.2, w, h * 0.55 + i * i * 2.2);
    }
    for (let i = -20; i <= 20; i++) {
      grid.lineBetween(cx + i * 60, h * 0.55, cx + i * 220, h);
    }

    this.add.text(cx, 60, 'NITRO.IO', titleStyle(64)).setOrigin(0.5);
    this.add
      .text(cx, 108, 'DRIFT · GROW YOUR TRAIL · WRECK YOUR RIVALS', bodyStyle(14, hexToCss(PALETTE.magenta)))
      .setOrigin(0.5);

    // --- Driver card (left). ---
    const level = levelForXp(this.save.xp);
    const [xpCur, xpNeed] = xpProgress(this.save.xp);
    makePanel(this, 150, 240, 260, 170);
    this.add.text(40, 165, `DRIVER LVL ${level}`, titleStyle(22, hexToCss(PALETTE.uiText))).setOrigin(0, 0);
    this.add.rectangle(150, 205, 220, 10, 0x0a1020).setStrokeStyle(1, PALETTE.uiPanelStroke);
    this.add
      .rectangle(40, 205, Math.max(2, 220 * (xpCur / xpNeed)), 6, PALETTE.cyan)
      .setOrigin(0, 0.5);
    this.add.text(40, 216, `${xpCur} / ${xpNeed} XP`, bodyStyle(11, hexToCss(PALETTE.uiDim)));
    this.add.text(40, 240, `🔩 ${this.save.scrap} scrap`, bodyStyle(15, hexToCss(PALETTE.amber)));
    this.add.text(40, 264, `🏆 ${this.save.trophies} trophies`, bodyStyle(15, hexToCss(PALETTE.gold)));
    this.add.text(40, 288, `🔥 ${this.save.streakDays}-day streak`, bodyStyle(15, hexToCss(PALETTE.magenta)));
    if (this.save.lifetime.bestScore > 0) {
      this.add.text(40, 312, `Best score: ${this.save.lifetime.bestScore}`, bodyStyle(12, hexToCss(PALETTE.uiDim)));
    }

    // --- Arena selector (center). ---
    const unlocked = unlockedArenas(this.save);
    const arena = ARENAS[this.arenaIndex];
    const isUnlocked = unlocked.includes(arena.id);

    makePanel(this, cx, 240, 330, 170);
    this.add.text(cx, 178, 'ARENA', bodyStyle(12, hexToCss(PALETTE.uiDim))).setOrigin(0.5);
    this.add
      .text(cx, 210, (arena.night ? '🌙 ' : '') + arena.name, titleStyle(22, hexToCss(isUnlocked ? PALETTE.cyan : 0x667088)))
      .setOrigin(0.5);
    this.add
      .text(
        cx,
        242,
        isUnlocked
          ? `Rewards ×${arena.rewardMult}  ·  ${arena.botCount} rivals`
          : `🔒 Requires ${arena.unlockTrophies} trophies`,
        bodyStyle(13, hexToCss(isUnlocked ? PALETTE.uiText : PALETTE.red)),
      )
      .setOrigin(0.5);
    this.add
      .text(cx, 268, arena.night ? 'Headlights only — double rewards!' : envBlurb(arena.envId), bodyStyle(12, hexToCss(PALETTE.uiDim)))
      .setOrigin(0.5);

    makeButton(this, cx - 140, 240, 40, 60, '‹', () => this.cycleArena(-1));
    makeButton(this, cx + 140, 240, 40, 60, '›', () => this.cycleArena(1));

    // --- Play + garage. ---
    const play = makeButton(this, cx, 380, 260, 62, '▶  PLAY', () => {
      if (!isUnlocked) return;
      this.save.selectedArena = arena.id;
      persistSave(this.save);
      this.scene.start('arena', { arenaId: arena.id });
    }, PALETTE.lime);
    play.setEnabled(isUnlocked);
    makeButton(this, cx, 448, 260, 44, '🔧 GARAGE', () => this.scene.start('garage'));

    // --- Missions (right). ---
    makePanel(this, w - 170, 270, 300, 230);
    this.add.text(w - 305, 168, 'MISSIONS', titleStyle(18, hexToCss(PALETTE.gold))).setOrigin(0, 0);
    const states = [...this.save.dailyMissions];
    if (this.save.weeklyMission) states.push(this.save.weeklyMission);
    states.forEach((state, i) => {
      const def = missionDef(state.id);
      if (!def) return;
      const y = 205 + i * 44;
      const done = state.progress >= def.target;
      this.add.text(w - 305, y, def.text, bodyStyle(12, hexToCss(def.weekly ? PALETTE.violet : PALETTE.uiText)));
      if (state.claimed) {
        this.add.text(w - 305, y + 16, '✓ Claimed', bodyStyle(11, hexToCss(PALETTE.uiDim)));
      } else if (done) {
        const btn = makeButton(this, w - 90, y + 12, 96, 24, `CLAIM +${def.rewardScrap}🔩`, () => {
          if (claimMission(this.save, state.id)) {
            sfx.reward();
            persistSave(this.save);
            this.buildUi();
          }
        }, PALETTE.gold);
        void btn;
        this.add.text(w - 305, y + 16, 'Complete!', bodyStyle(11, hexToCss(PALETTE.lime)));
      } else {
        this.add.text(
          w - 305,
          y + 16,
          `${formatProgress(state.progress, def.target, def.metric)}  ·  +${def.rewardScrap}🔩 +${def.rewardXp}xp`,
          bodyStyle(11, hexToCss(PALETTE.uiDim)),
        );
      }
    });

    this.add
      .text(cx, h - 24, 'A tribute to NITRO (Psygnosis, 1990) — grow the longest nitro trail in the arena', bodyStyle(11, hexToCss(PALETTE.uiDim)))
      .setOrigin(0.5);
  }

  private cycleArena(dir: number): void {
    this.arenaIndex = (this.arenaIndex + dir + ARENAS.length) % ARENAS.length;
    this.buildUi();
  }
}

function envBlurb(envId: string): string {
  switch (envId) {
    case 'city':
      return 'Slick streets, heavy traffic cones';
    case 'forest':
      return 'Muddy trails, hidden potholes';
    case 'desert':
      return 'Wide dunes, brutal potholes';
    case 'wasteland':
      return 'Toxic sludge everywhere — expert territory';
    default:
      return '';
  }
}

function formatProgress(progress: number, target: number, metric: string): string {
  if (metric === 'surviveMs' || metric === 'boostMs') {
    return `${Math.floor(progress / 1000)}s / ${Math.floor(target / 1000)}s`;
  }
  return `${Math.floor(progress)} / ${target}`;
}
