import Phaser from 'phaser';
import { ARENAS } from '../config/arenas';
import { PALETTE, hexToCss } from '../config/palette';
import { sfx } from '../game/sfx';
import { music } from '../game/music';
import { claimMission, missionDef, refreshMissions } from '../meta/Missions';
import { levelForXp, xpProgress } from '../meta/Progression';
import { loadSave, persistSave, type SaveData } from '../meta/SaveGame';
import { unlockedArenas } from '../meta/Unlocks';
import { bodyStyle, clearScene, fitToScreen, formatMs, isNarrow, makeButton, makePanel, titleStyle } from '../ui/widgets';
import { decodeGhost, type GhostData } from '../game/ghost';
import { FUELS } from '../config/fuels';
import { trackForArena } from '../config/tracks';

export class MenuScene extends Phaser.Scene {
  private save!: SaveData;
  private arenaIndex = 0;
  private pendingGhost?: GhostData;
  private pendingJoin?: string;

  constructor() {
    super('menu');
  }

  create(): void {
    this.save = loadSave();
    // A friend's challenge link carries a ghost in the URL fragment;
    // a multiplayer invite carries a room code.
    const ghostMatch = /#ghost=([A-Za-z0-9_-]+)/.exec(window.location.hash);
    this.pendingGhost = ghostMatch ? (decodeGhost(ghostMatch[1]) ?? undefined) : undefined;
    const joinMatch = /#join=([A-Z2-9]{5})/.exec(window.location.hash);
    this.pendingJoin = joinMatch?.[1];
    refreshMissions(this.save, new Date());
    persistSave(this.save);
    this.arenaIndex = Math.max(0, ARENAS.findIndex((a) => a.id === this.save.selectedArena));
    this.buildUi();

    this.scale.on('resize', this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.onResize, this);
    });

    // Browsers only allow audio after a user gesture.
    this.input.once('pointerdown', () => music.start());
    this.input.keyboard?.once('keydown', () => music.start());
    this.input.keyboard?.on('keydown-M', () => music.toggleMute());
  }

  private onResize(): void {
    this.buildUi();
  }

  private buildUi(): void {
    clearScene(this);
    const w = this.scale.width;
    const h = this.scale.height;

    // Full-screen backdrop + synthwave horizon (not part of the scaled root).
    this.add.rectangle(w / 2, h / 2, w, h, PALETTE.deepSpace);
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x28285a, 0.5);
    for (let i = 0; i < 20; i++) grid.lineBetween(0, h * 0.55 + i * i * 2.2, w, h * 0.55 + i * i * 2.2);
    for (let i = -20; i <= 20; i++) grid.lineBetween(w / 2 + i * 60, h * 0.55, w / 2 + i * 220, h);

    const start = this.children.list.length;
    const narrow = isNarrow(this);
    if (narrow) this.buildNarrow();
    else this.buildWide();
    fitToScreen(this, start, narrow ? 420 : 960, narrow ? 890 : 560);
  }

  // ---------- Wide (desktop / landscape) — 960×560 design canvas ----------

  private buildWide(): void {
    this.add.text(480, 44, 'NITRO.IO', titleStyle(46)).setOrigin(0.5);
    this.add
      .text(480, 88, 'DRIFT · GROW YOUR TRAIL · WRECK YOUR RIVALS', bodyStyle(13, hexToCss(PALETTE.magenta)))
      .setOrigin(0.5);

    this.buildDriverCard(140, 240, 240, 170);
    this.buildArenaSelector(480, 240, 330, 170);

    this.buildFuelPicker(480, 340, 108, 30);

    const unlocked = unlockedArenas(this.save).includes(ARENAS[this.arenaIndex].id);
    const play = makeButton(this, 480, 386, 260, 46, '▶  ARENA', () => this.startRun(), PALETTE.lime);
    play.setEnabled(unlocked);
    const raceTrack = trackForArena(ARENAS[this.arenaIndex]);
    makeButton(this, 480, 432, 260, 40, `🏁 RACE — ${raceTrack.name}`, () => this.scene.start('race', { trackId: raceTrack.id }), PALETTE.amber);
    makeButton(this, 410, 474, 130, 34, '👥 FRIENDS', () => this.scene.start('lobby', { mode: 'host' }), PALETTE.violet);
    makeButton(this, 550, 474, 130, 34, '🔧 GARAGE', () => this.scene.start('garage'));
    this.buildRaceToggles(480, 512, 152, 26);
    if (this.pendingJoin) {
      const code = this.pendingJoin;
      makeButton(this, 480, 546, 300, 28, `👥 JOIN RACE ${code}`, () => this.scene.start('lobby', { mode: 'join', code }), PALETTE.lime);
    } else if (this.pendingGhost) {
      const g = this.pendingGhost;
      makeButton(this, 480, 546, 300, 28, `👻 RACE ${g.name.slice(0, 10)} — ${formatMs(g.timeMs)}`, () => this.scene.start('race', { ghost: g }), PALETTE.violet);
    }

    this.buildMissions(688, 152, 264);

    if (!this.pendingJoin && !this.pendingGhost) {
      this.add
        .text(480, 550, 'A tribute to NITRO (Psygnosis, 1990)  ·  M: music  ·  F: fire', bodyStyle(11, hexToCss(PALETTE.uiDim)))
        .setOrigin(0.5);
    }
  }

  // ---------- Narrow (mobile portrait) — 420×810 design canvas ----------

  private buildNarrow(): void {
    this.add.text(210, 52, 'NITRO.IO', titleStyle(42)).setOrigin(0.5);
    this.add
      .text(210, 92, 'DRIFT · GROW · WRECK YOUR RIVALS', bodyStyle(11, hexToCss(PALETTE.magenta)))
      .setOrigin(0.5);

    // Compact driver card.
    makePanel(this, 210, 172, 384, 108);
    const level = levelForXp(this.save.xp);
    const [xpCur, xpNeed] = xpProgress(this.save.xp);
    this.add.text(28, 128, `DRIVER LVL ${level}`, titleStyle(17, hexToCss(PALETTE.uiText)));
    this.add.text(392, 132, `${xpCur}/${xpNeed} XP`, bodyStyle(10, hexToCss(PALETTE.uiDim))).setOrigin(1, 0);
    this.add.rectangle(210, 156, 340, 8, 0x0a1020).setStrokeStyle(1, PALETTE.uiPanelStroke);
    this.add.rectangle(40, 156, Math.max(2, 340 * (xpCur / xpNeed)), 5, PALETTE.cyan).setOrigin(0, 0.5);
    this.add.text(
      28,
      172,
      `🔩 ${this.save.scrap}    🏆 ${this.save.trophies}    🔥 ${this.save.streakDays}d streak`,
      bodyStyle(13, hexToCss(PALETTE.amber)),
    );
    if (this.save.lifetime.bestScore > 0) {
      this.add.text(28, 196, `Best score: ${this.save.lifetime.bestScore}`, bodyStyle(11, hexToCss(PALETTE.uiDim)));
    }

    this.buildArenaSelector(210, 300, 384, 136);
    this.buildFuelPicker(210, 386, 118, 32);

    const unlocked = unlockedArenas(this.save).includes(ARENAS[this.arenaIndex].id);
    const play = makeButton(this, 210, 428, 336, 42, '▶  ARENA', () => this.startRun(), PALETTE.lime);
    play.setEnabled(unlocked);
    const raceTrack = trackForArena(ARENAS[this.arenaIndex]);
    makeButton(this, 210, 470, 336, 36, `🏁 RACE — ${raceTrack.name}`, () => this.scene.start('race', { trackId: raceTrack.id }), PALETTE.amber);
    makeButton(this, 123, 508, 162, 32, '👥 FRIENDS', () => this.scene.start('lobby', { mode: 'host' }), PALETTE.violet);
    makeButton(this, 297, 508, 162, 32, '🔧 GARAGE', () => this.scene.start('garage'));
    this.buildRaceToggles(210, 544, 160, 28);
    if (this.pendingJoin) {
      const code = this.pendingJoin;
      makeButton(this, 210, 580, 336, 30, `👥 JOIN RACE ${code}`, () => this.scene.start('lobby', { mode: 'join', code }), PALETTE.lime);
    } else if (this.pendingGhost) {
      const g = this.pendingGhost;
      makeButton(this, 210, 580, 336, 30, `👻 RACE ${g.name.slice(0, 10)} — ${formatMs(g.timeMs)}`, () => this.scene.start('race', { ghost: g }), PALETTE.violet);
    }

    this.buildMissions(26, 618, 368);

    this.add
      .text(210, 876, 'A tribute to NITRO (1990)  ·  M: music', bodyStyle(10, hexToCss(PALETTE.uiDim)))
      .setOrigin(0.5);
  }

  // ---------- Shared building blocks ----------

  /** Race options: per-track blackouts + global weapons toggle. */
  private buildRaceToggles(cx: number, y: number, w: number, h: number): void {
    const track = trackForArena(ARENAS[this.arenaIndex]);
    const blackoutOn = this.save.blackoutTracks[track.id] ?? false;
    const weaponsOn = this.save.shootingEnabled;

    const mk = (x: number, label: string, on: boolean, toggle: () => void): void => {
      const bg = this.add
        .rectangle(x, y, w, h, on ? 0x1a2a44 : PALETTE.uiPanel, 0.92)
        .setStrokeStyle(on ? 2.5 : 1.5, on ? PALETTE.lime : 0x445066);
      this.add.text(x, y, label, bodyStyle(11, hexToCss(on ? PALETTE.lime : PALETTE.uiDim))).setOrigin(0.5);
      bg.setInteractive({ useHandCursor: true }).on('pointerup', (p: Phaser.Input.Pointer) => {
        if (p.getDistance() > 16) return;
        sfx.click();
        toggle();
        persistSave(this.save);
        this.buildUi();
      });
    };

    mk(cx - w / 2 - 6, `⚡ BLACKOUT ${blackoutOn ? 'ON' : 'OFF'}`, blackoutOn, () => {
      this.save.blackoutTracks[track.id] = !blackoutOn;
    });
    mk(cx + w / 2 + 6, `🔥 WEAPONS ${weaponsOn ? 'ON' : 'OFF'}`, weaponsOn, () => {
      this.save.shootingEnabled = !weaponsOn;
    });
  }

  /** Fuel/drivetrain picker — decides your trail & exhaust identity. */
  private buildFuelPicker(cx: number, y: number, w: number, h: number): void {
    FUELS.forEach((fuel, i) => {
      const x = cx + (i - 1) * (w + 10);
      const selected = this.save.selectedFuel === fuel.id;
      const color = fuel.trailColors[1];
      const bg = this.add
        .rectangle(x, y, w, h, selected ? 0x1a2a44 : PALETTE.uiPanel, 0.92)
        .setStrokeStyle(selected ? 3 : 1.5, selected ? 0xffffff : color);
      this.add
        .text(x, y, `${fuel.emoji} ${fuel.name.toUpperCase()}`, bodyStyle(11, hexToCss(color)))
        .setOrigin(0.5);
      bg.setInteractive({ useHandCursor: true }).on('pointerup', (p: Phaser.Input.Pointer) => {
        if (p.getDistance() > 16) return;
        sfx.click();
        this.save.selectedFuel = fuel.id;
        persistSave(this.save);
        this.buildUi();
      });
    });
  }

  private buildDriverCard(cx: number, cy: number, pw: number, ph: number): void {
    makePanel(this, cx, cy, pw, ph);
    const left = cx - pw / 2 + 20;
    const top = cy - ph / 2 + 12;
    const level = levelForXp(this.save.xp);
    const [xpCur, xpNeed] = xpProgress(this.save.xp);
    this.add.text(left, top, `DRIVER LVL ${level}`, titleStyle(20, hexToCss(PALETTE.uiText)));
    this.add.rectangle(cx, top + 38, pw - 40, 9, 0x0a1020).setStrokeStyle(1, PALETTE.uiPanelStroke);
    this.add.rectangle(left, top + 38, Math.max(2, (pw - 40) * (xpCur / xpNeed)), 5, PALETTE.cyan).setOrigin(0, 0.5);
    this.add.text(left, top + 48, `${xpCur} / ${xpNeed} XP`, bodyStyle(10, hexToCss(PALETTE.uiDim)));
    this.add.text(left, top + 70, `🔩 ${this.save.scrap} scrap`, bodyStyle(14, hexToCss(PALETTE.amber)));
    this.add.text(left, top + 93, `🏆 ${this.save.trophies} trophies`, bodyStyle(14, hexToCss(PALETTE.gold)));
    this.add.text(left, top + 116, `🔥 ${this.save.streakDays}-day streak`, bodyStyle(14, hexToCss(PALETTE.magenta)));
    if (this.save.lifetime.bestScore > 0) {
      this.add.text(left, top + 139, `Best score: ${this.save.lifetime.bestScore}`, bodyStyle(11, hexToCss(PALETTE.uiDim)));
    }
  }

  private buildArenaSelector(cx: number, cy: number, pw: number, ph: number): void {
    const arena = ARENAS[this.arenaIndex];
    const unlocked = unlockedArenas(this.save).includes(arena.id);
    makePanel(this, cx, cy, pw, ph);
    const top = cy - ph / 2;
    this.add.text(cx, top + 16, 'ARENA', bodyStyle(11, hexToCss(PALETTE.uiDim))).setOrigin(0.5);
    this.add
      .text(cx, top + 44, (arena.night ? '🌙 ' : '') + arena.name, titleStyle(20, hexToCss(unlocked ? PALETTE.cyan : 0x667088)))
      .setOrigin(0.5);
    this.add
      .text(
        cx,
        top + 76,
        unlocked ? `Rewards ×${arena.rewardMult}  ·  ${arena.botCount} rivals` : `🔒 Requires ${arena.unlockTrophies} trophies`,
        bodyStyle(12, hexToCss(unlocked ? PALETTE.uiText : PALETTE.red)),
      )
      .setOrigin(0.5);
    this.add
      .text(cx, top + 100, arena.night ? 'Headlights only — double rewards!' : envBlurb(arena.envId), bodyStyle(11, hexToCss(PALETTE.uiDim)))
      .setOrigin(0.5);
    makeButton(this, cx - pw / 2 + 24, cy, 40, 64, '‹', () => this.cycleArena(-1));
    makeButton(this, cx + pw / 2 - 24, cy, 40, 64, '›', () => this.cycleArena(1));
  }

  private buildMissions(x: number, y: number, width: number): void {
    const states = [...this.save.dailyMissions];
    if (this.save.weeklyMission) states.push(this.save.weeklyMission);
    const rowH = 48;
    makePanel(this, x + width / 2, y + 20 + (states.length * rowH) / 2, width + 24, states.length * rowH + 46, 0.8);
    this.add.text(x, y, 'MISSIONS', titleStyle(17, hexToCss(PALETTE.gold)));

    states.forEach((state, i) => {
      const def = missionDef(state.id);
      if (!def) return;
      const rowY = y + 34 + i * rowH;
      const done = state.progress >= def.target;
      this.add.text(x, rowY, def.text, bodyStyle(12, hexToCss(def.weekly ? PALETTE.violet : PALETTE.uiText)));
      if (state.claimed) {
        this.add.text(x, rowY + 17, '✓ Claimed', bodyStyle(10, hexToCss(PALETTE.uiDim)));
      } else if (done) {
        this.add.text(x, rowY + 17, 'Complete!', bodyStyle(10, hexToCss(PALETTE.lime)));
        makeButton(this, x + width - 52, rowY + 13, 104, 26, `CLAIM +${def.rewardScrap}🔩`, () => {
          if (claimMission(this.save, state.id)) {
            sfx.reward();
            persistSave(this.save);
            this.buildUi();
          }
        }, PALETTE.gold);
      } else {
        this.add.text(
          x,
          rowY + 17,
          `${formatProgress(state.progress, def.target, def.metric)}  ·  +${def.rewardScrap}🔩 +${def.rewardXp}xp`,
          bodyStyle(10, hexToCss(PALETTE.uiDim)),
        );
      }
    });
  }

  private startRun(): void {
    const arena = ARENAS[this.arenaIndex];
    if (!unlockedArenas(this.save).includes(arena.id)) return;
    this.save.selectedArena = arena.id;
    persistSave(this.save);
    this.scene.start('arena', { arenaId: arena.id });
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
