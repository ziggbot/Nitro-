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
import { TRACKS } from '../config/tracks';
import { drawPixelLogo } from './IntroScene';

/**
 * Front page, restructured around TWO primary choices — ARENA and RACE —
 * shown as big mode cards. Each opens its own setup view with the mode's
 * sub-choices (arena/track, fuel, toggles, multiplayer), so the home
 * screen stays calm: logo, driver strip, two cards, missions.
 */
export class MenuScene extends Phaser.Scene {
  private save!: SaveData;
  private view: 'home' | 'arena' | 'race' = 'home';
  private arenaIndex = 0;
  private trackIndex = 0;
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
    this.trackIndex = Math.max(0, TRACKS.findIndex((t) => t.id === this.save.selectedTrack));
    this.view = 'home';
    this.buildUi();

    this.scale.on('resize', this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.onResize, this);
    });

    // Browsers only allow audio after a user gesture.
    this.input.once('pointerdown', () => music.start());
    this.input.keyboard?.once('keydown', () => music.start());
    this.input.keyboard?.on('keydown-M', () => music.toggleMute());
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.view !== 'home') {
        this.view = 'home';
        this.buildUi();
      }
    });
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
    const dh = narrow ? 760 : 560;
    if (this.view === 'home') (narrow ? this.homeNarrow : this.homeWide).call(this);
    else if (this.view === 'arena') this.setupView(narrow, 'arena');
    else this.setupView(narrow, 'race');
    fitToScreen(this, start, narrow ? 420 : 960, dh);
  }

  // ---------- Home: two big mode cards ----------

  private homeWide(): void {
    drawPixelLogo(this, 480, 50, 7);
    this.add.text(480, 96, 'DRIFT · GROW YOUR TRAIL · WRECK YOUR RIVALS', bodyStyle(12, hexToCss(PALETTE.magenta))).setOrigin(0.5);

    this.buildDriverStrip(480, 130, 640);

    const arena = ARENAS[this.arenaIndex];
    const track = TRACKS[this.trackIndex];
    this.buildModeCard(282, 240, 372, 164, PALETTE.lime, '🏟️', 'ARENA', 'Trail survival — outlast 15 rivals', `${arena.night ? '🌙 ' : ''}${arena.name}`, () =>
      this.openView('arena'),
    );
    this.buildModeCard(678, 240, 372, 164, PALETTE.amber, '🏁', 'RACE', 'Grand Prix — laps, ramps & weapons', `${track.daylight ? '' : '🌙 '}${track.name}`, () =>
      this.openView('race'),
    );

    makeButton(this, 400, 352, 150, 34, '👥 FRIENDS', () => this.scene.start('lobby', { mode: 'host' }), PALETTE.violet);
    makeButton(this, 560, 352, 150, 34, '🔧 GARAGE', () => this.scene.start('garage'));

    this.buildMissionsCompact(480, 388, 620);

    if (this.pendingJoin) {
      const code = this.pendingJoin;
      makeButton(this, 480, 548, 340, 32, `👥 JOIN RACE ${code}`, () => this.scene.start('lobby', { mode: 'join', code }), PALETTE.lime);
    } else if (this.pendingGhost) {
      const g = this.pendingGhost;
      makeButton(this, 480, 548, 340, 32, `👻 RACE ${g.name.slice(0, 10)} — ${formatMs(g.timeMs)}`, () => this.scene.start('race', { ghost: g }), PALETTE.violet);
    } else {
      this.add
        .text(480, 552, 'A tribute to NITRO (Psygnosis, 1990)  ·  M: music', bodyStyle(11, hexToCss(PALETTE.uiDim)))
        .setOrigin(0.5);
    }
  }

  private homeNarrow(): void {
    drawPixelLogo(this, 210, 54, 6);
    this.add.text(210, 96, 'DRIFT · GROW · WRECK YOUR RIVALS', bodyStyle(11, hexToCss(PALETTE.magenta))).setOrigin(0.5);

    this.buildDriverStrip(210, 132, 384);

    const arena = ARENAS[this.arenaIndex];
    const track = TRACKS[this.trackIndex];
    this.buildModeCard(210, 232, 384, 136, PALETTE.lime, '🏟️', 'ARENA', 'Trail survival — outlast rivals', `${arena.night ? '🌙 ' : ''}${arena.name}`, () =>
      this.openView('arena'),
    );
    this.buildModeCard(210, 382, 384, 136, PALETTE.amber, '🏁', 'RACE', 'Grand Prix — ramps & weapons', `${track.daylight ? '' : '🌙 '}${track.name}`, () =>
      this.openView('race'),
    );

    makeButton(this, 118, 472, 176, 34, '👥 FRIENDS', () => this.scene.start('lobby', { mode: 'host' }), PALETTE.violet);
    makeButton(this, 302, 472, 176, 34, '🔧 GARAGE', () => this.scene.start('garage'));

    this.buildMissionsCompact(210, 508, 384);

    if (this.pendingJoin) {
      const code = this.pendingJoin;
      makeButton(this, 210, 706, 340, 32, `👥 JOIN RACE ${code}`, () => this.scene.start('lobby', { mode: 'join', code }), PALETTE.lime);
    } else if (this.pendingGhost) {
      const g = this.pendingGhost;
      makeButton(this, 210, 706, 340, 32, `👻 RACE ${g.name.slice(0, 10)} — ${formatMs(g.timeMs)}`, () => this.scene.start('race', { ghost: g }), PALETTE.violet);
    } else {
      this.add.text(210, 712, 'A tribute to NITRO (1990)  ·  M: music', bodyStyle(10, hexToCss(PALETTE.uiDim))).setOrigin(0.5);
    }
  }

  private openView(view: 'arena' | 'race'): void {
    sfx.click();
    this.view = view;
    this.buildUi();
  }

  /** A big tappable mode card: accent bar, icon, title, blurb, selection. */
  private buildModeCard(
    cx: number,
    cy: number,
    w: number,
    h: number,
    accent: number,
    icon: string,
    title: string,
    blurb: string,
    selection: string,
    onTap: () => void,
  ): void {
    this.add.rectangle(cx, cy, w + 12, h + 12, accent, 0.06);
    const bg = this.add.rectangle(cx, cy, w, h, 0x0e1628, 0.96).setStrokeStyle(2.5, accent, 0.95);
    this.add.rectangle(cx, cy - h / 2 + 3, w - 4, 5, accent, 0.9);
    const left = cx - w / 2;
    this.add.text(left + 48, cy - 10, icon, { fontSize: '44px' }).setOrigin(0.5);
    this.add.text(left + 92, cy - h / 2 + 26, title, titleStyle(26, hexToCss(accent)));
    this.add.text(left + 92, cy - h / 2 + 62, blurb, bodyStyle(12, hexToCss(PALETTE.uiText)));
    this.add.text(left + 92, cy + h / 2 - 36, `▸ ${selection}`, bodyStyle(13, hexToCss(PALETTE.cyan)));
    this.add.text(cx + w / 2 - 26, cy, '›', titleStyle(34, hexToCss(accent))).setOrigin(0.5).setAlpha(0.8);

    bg.setInteractive({ useHandCursor: true })
      .on('pointerover', () => bg.setFillStyle(0x16223c, 0.98).setStrokeStyle(3.5, accent, 1))
      .on('pointerout', () => bg.setFillStyle(0x0e1628, 0.96).setStrokeStyle(2.5, accent, 0.95))
      .on('pointerup', (p: Phaser.Input.Pointer) => {
        if (p.getDistance() > 16) return;
        onTap();
      });
  }

  /** One-line driver summary: level, XP bar, currencies, streak. */
  private buildDriverStrip(cx: number, y: number, w: number): void {
    makePanel(this, cx, y, w, 38, 0.6);
    const level = levelForXp(this.save.xp);
    const [xpCur, xpNeed] = xpProgress(this.save.xp);
    this.add.text(cx - w / 2 + 14, y, `LVL ${level}`, titleStyle(15, hexToCss(PALETTE.cyan))).setOrigin(0, 0.5);
    const barX = cx - w / 2 + 84;
    const barW = Math.min(190, w * 0.3);
    this.add.rectangle(barX + barW / 2, y, barW, 8, 0x0a1020).setStrokeStyle(1, PALETTE.uiPanelStroke);
    this.add.rectangle(barX, y, Math.max(2, barW * (xpCur / xpNeed)), 5, PALETTE.cyan).setOrigin(0, 0.5);
    this.add
      .text(cx + w / 2 - 14, y, `🔩 ${this.save.scrap}   🏆 ${this.save.trophies}   🔥 ${this.save.streakDays}d`, bodyStyle(13, hexToCss(PALETTE.amber)))
      .setOrigin(1, 0.5);
  }

  /** Missions as compact one-line rows with inline claim chips. */
  private buildMissionsCompact(cx: number, top: number, w: number): void {
    const states = [...this.save.dailyMissions];
    if (this.save.weeklyMission) states.push(this.save.weeklyMission);
    const rowH = 28;
    const panelH = states.length * rowH + 40;
    makePanel(this, cx, top + panelH / 2, w, panelH, 0.7);
    const left = cx - w / 2 + 16;
    this.add.text(left, top + 10, 'MISSIONS', titleStyle(14, hexToCss(PALETTE.gold)));

    states.forEach((state, i) => {
      const def = missionDef(state.id);
      if (!def) return;
      const rowY = top + 40 + i * rowH;
      const done = state.progress >= def.target;
      this.add
        .text(left, rowY, def.text, bodyStyle(12, hexToCss(def.weekly ? PALETTE.violet : PALETTE.uiText)))
        .setOrigin(0, 0.5);
      if (state.claimed) {
        this.add.text(cx + w / 2 - 16, rowY, '✓', bodyStyle(13, hexToCss(PALETTE.lime))).setOrigin(1, 0.5);
      } else if (done) {
        makeButton(this, cx + w / 2 - 66, rowY, 100, 24, `CLAIM +${def.rewardScrap}🔩`, () => {
          if (claimMission(this.save, state.id)) {
            sfx.reward();
            persistSave(this.save);
            this.buildUi();
          }
        }, PALETTE.gold);
      } else {
        this.add
          .text(cx + w / 2 - 16, rowY, `${formatProgress(state.progress, def.target, def.metric)} · +${def.rewardScrap}🔩`, bodyStyle(10, hexToCss(PALETTE.uiDim)))
          .setOrigin(1, 0.5);
      }
    });
  }

  // ---------- Setup views: the sub-choices for each main mode ----------

  private setupView(narrow: boolean, mode: 'arena' | 'race'): void {
    const cx = narrow ? 210 : 480;
    const accent = mode === 'arena' ? PALETTE.lime : PALETTE.amber;
    makeButton(this, narrow ? 54 : 84, 44, narrow ? 84 : 96, 32, '‹ BACK', () => {
      this.view = 'home';
      this.buildUi();
    });
    drawPixelLogo(this, cx, 46, narrow ? 4 : 5);
    this.add
      .text(cx, 100, mode === 'arena' ? '🏟️ ARENA' : '🏁 RACE', titleStyle(30, hexToCss(accent)))
      .setOrigin(0.5);

    const selW = narrow ? 384 : 480;
    if (mode === 'arena') {
      this.buildArenaSelector(cx, 210, selW, 170);
      this.add.text(cx, 312, 'PICK YOUR RIDE', bodyStyle(11, hexToCss(PALETTE.uiDim))).setOrigin(0.5);
      this.buildFuelPicker(cx, 342, narrow ? 118 : 128, 34);
      const unlocked = unlockedArenas(this.save).includes(ARENAS[this.arenaIndex].id);
      const play = makeButton(this, cx, 412, narrow ? 336 : 320, 52, '▶  PLAY ARENA', () => this.startRun(), PALETTE.lime);
      play.setEnabled(unlocked);
      this.add
        .text(cx, 456, 'Eat fuel orbs, grow your trail, cut off rivals to wreck them.', bodyStyle(11, hexToCss(PALETTE.uiDim)))
        .setOrigin(0.5);
    } else {
      this.buildTrackSelector(cx, 215, selW, 180);
      this.add.text(cx, 322, 'PICK YOUR RIDE', bodyStyle(11, hexToCss(PALETTE.uiDim))).setOrigin(0.5);
      this.buildFuelPicker(cx, 352, narrow ? 118 : 128, 34);
      this.buildRaceToggles(cx, 398, narrow ? 160 : 168, 30);
      const track = TRACKS[this.trackIndex];
      makeButton(this, cx, 462, narrow ? 336 : 320, 52, '🏁  START RACE', () => {
        this.save.selectedTrack = track.id;
        persistSave(this.save);
        this.scene.start('race', { trackId: track.id });
      }, PALETTE.amber);
      makeButton(this, cx, 516, narrow ? 336 : 320, 34, '👥 RACE FRIENDS — HOST LOBBY', () => this.scene.start('lobby', { mode: 'host' }), PALETTE.violet);
      if (this.pendingGhost) {
        const g = this.pendingGhost;
        makeButton(this, cx, 556, narrow ? 336 : 320, 30, `👻 RACE ${g.name.slice(0, 10)} — ${formatMs(g.timeMs)}`, () => this.scene.start('race', { ghost: g }), PALETTE.violet);
      }
    }
  }

  // ---------- Shared building blocks ----------

  /** Race options: per-track blackouts + global weapons toggle. */
  private buildRaceToggles(cx: number, y: number, w: number, h: number): void {
    const track = TRACKS[this.trackIndex];
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

  private buildArenaSelector(cx: number, cy: number, pw: number, ph: number): void {
    const arena = ARENAS[this.arenaIndex];
    const unlocked = unlockedArenas(this.save).includes(arena.id);
    makePanel(this, cx, cy, pw, ph);
    const top = cy - ph / 2;
    this.add.text(cx, top + 16, `ARENA ${this.arenaIndex + 1}/${ARENAS.length}`, bodyStyle(11, hexToCss(PALETTE.uiDim))).setOrigin(0.5);
    this.add
      .text(cx, top + 46, (arena.night ? '🌙 ' : '') + arena.name, titleStyle(21, hexToCss(unlocked ? PALETTE.cyan : 0x667088)))
      .setOrigin(0.5);
    this.add
      .text(
        cx,
        top + 80,
        unlocked ? `Rewards ×${arena.rewardMult}  ·  ${arena.botCount} rivals` : `🔒 Requires ${arena.unlockTrophies} trophies`,
        bodyStyle(12, hexToCss(unlocked ? PALETTE.uiText : PALETTE.red)),
      )
      .setOrigin(0.5);
    this.add
      .text(cx, top + 106, arena.night ? 'Headlights only — double rewards!' : envBlurb(arena.envId), bodyStyle(11, hexToCss(PALETTE.uiDim)))
      .setOrigin(0.5);
    makeButton(this, cx - pw / 2 + 26, cy, 44, 72, '‹', () => this.cycleArena(-1));
    makeButton(this, cx + pw / 2 - 26, cy, 44, 72, '›', () => this.cycleArena(1));
  }

  private buildTrackSelector(cx: number, cy: number, pw: number, ph: number): void {
    const track = TRACKS[this.trackIndex];
    makePanel(this, cx, cy, pw, ph);
    const top = cy - ph / 2;
    this.add.text(cx, top + 16, `TRACK ${this.trackIndex + 1}/${TRACKS.length}`, bodyStyle(11, hexToCss(PALETTE.uiDim))).setOrigin(0.5);
    this.add
      .text(cx, top + 46, (track.daylight ? '' : '🌙 ') + track.name, titleStyle(21, hexToCss(PALETTE.amber)))
      .setOrigin(0.5);
    this.add
      .text(cx, top + 80, `${track.laps} laps  ·  Rewards ×${track.rewardMult}  ·  ${track.botCount} rivals`, bodyStyle(12, hexToCss(PALETTE.uiText)))
      .setOrigin(0.5);
    this.add.text(cx, top + 106, trackBlurb(track.id), bodyStyle(11, hexToCss(PALETTE.uiDim))).setOrigin(0.5);
    const blackoutOn = this.save.blackoutTracks[track.id] ?? false;
    if (blackoutOn) {
      this.add.text(cx, top + 130, '⚡ Blackouts armed on this track', bodyStyle(11, hexToCss(PALETTE.violet))).setOrigin(0.5);
    }
    makeButton(this, cx - pw / 2 + 26, cy, 44, 72, '‹', () => this.cycleTrack(-1));
    makeButton(this, cx + pw / 2 - 26, cy, 44, 72, '›', () => this.cycleTrack(1));
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
    this.save.selectedArena = ARENAS[this.arenaIndex].id;
    persistSave(this.save);
    this.buildUi();
  }

  private cycleTrack(dir: number): void {
    this.trackIndex = (this.trackIndex + dir + TRACKS.length) % TRACKS.length;
    this.save.selectedTrack = TRACKS[this.trackIndex].id;
    persistSave(this.save);
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

function trackBlurb(trackId: string): string {
  switch (trackId) {
    case 'city-gp':
      return 'Street circuit — 90° corners, chicane & alley shortcut';
    case 'forest-gp':
      return 'Rally hairpins through the woods, fire-road shortcut';
    case 'desert-gp':
      return 'Flat-out dune sweepers with a canyon S-bend';
    case 'wasteland-gp':
      return 'Night switchback pretzel — toxic expert territory';
    case 'crossover-gp':
      return 'Night figure-8 over a neon bridge';
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
