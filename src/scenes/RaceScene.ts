import Phaser from 'phaser';
import { trackById, type TrackDef } from '../config/tracks';
import { CAR_CLASSES, effectiveStats } from '../config/cars';
import { ENV_PALETTES, PALETTE, hexToCss } from '../config/palette';
import type { Driver } from '../core/types';
import { botNames } from '../ai/names';
import { RaceBotDriver } from '../ai/RaceBotDriver';
import { CarSim } from '../game/CarSim';
import { PlayerDriver } from '../game/PlayerDriver';
import { buildPath, findCrossings, LapTracker, type Crossing, type RacePath } from '../game/racePath';
import { sfx } from '../game/sfx';
import { music } from '../game/music';
import { loadSave, type SaveData } from '../meta/SaveGame';
import { raceRewards } from '../meta/Progression';
import { ExhaustFx } from '../game/exhaust';
import { fuelById, randomFuel } from '../config/fuels';
import { GhostPlayer, GhostRecorder, type GhostData } from '../game/ghost';
import { touchControls } from '../game/touchControls';
import type { NetRoom, NetPlayer, StateMsg } from '../net/room';

interface RacerView {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  /** Ground shadow, shown separated from the car during ramp jumps. */
  shadow: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  flames: ExhaustFx;
}

interface RacerEntry {
  car: CarSim;
  driver: Driver;
  tracker: LapTracker;
  view: RacerView;
  finished: boolean;
  finishTime: number;
  /** Fireball ammo carried (weapons mode). */
  ammo: number;
  lastFireAt: number;
  /** Multiplayer: remote player's peer id (position comes from the net). */
  netId?: string;
}

interface NetworkData {
  room: NetRoom;
  players: NetPlayer[];
}

const idleDriver: Driver = { name: 'remote', isPlayer: false, getInput: () => ({ steer: 0, throttle: 0, boost: false }) };

interface TrackPickup {
  kind: 'fuel' | 'barrel' | 'ammo';
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Image;
  active: boolean;
  respawnAt: number;
}

interface Bomb {
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Image;
  ember: Phaser.GameObjects.Image;
  active: boolean;
  /** 0 = idle; otherwise the time it detonates. */
  explodeAt: number;
  respawnAt: number;
}

interface Fireball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ownerId: number;
  /** Fired from the bridge deck? Shots don't cross levels. */
  onBridge: boolean;
  sprite: Phaser.GameObjects.Image;
  expiresAt: number;
}

const CAR_RADIUS = 25;
const CAR_SCALE = 1.0;

/** Deterministic RNG so multiplayer clients build identical tracksides. */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RaceScene extends Phaser.Scene {
  private track!: TrackDef;
  private path!: RacePath;
  private save!: SaveData;

  racers: RacerEntry[] = [];
  player!: RacerEntry;
  private pickups: TrackPickup[] = [];
  private hazards: { kind: 'oil' | 'cone' | 'pothole'; x: number; y: number; r: number; sprite: Phaser.GameObjects.Image }[] = [];
  /** Solid scenery: buildings (rects) and roadside props (circles). */
  private buildings: { x: number; y: number; w: number; h: number }[] = [];
  private props: { x: number; y: number; r: number }[] = [];
  private lastBumpAt = 0;

  // Ghost racing: replay a friend's run, record our own.
  private ghostData?: GhostData;
  private ghostPlayer?: GhostPlayer;
  private ghostSprite?: Phaser.GameObjects.Container;
  private recorder = new GhostRecorder();

  // Live multiplayer.
  private net?: NetworkData;
  private remoteTargets = new Map<string, StateMsg>();
  private lastNetSend = 0;

  // Weapons + bombs.
  shootingOn = false;
  private bombs: Bomb[] = [];
  private fireballs: Fireball[] = [];
  private fireQueued = false;

  // Track features: boost pads, jump ramps, shortcuts, bridge crossings.
  private pads: { x: number; y: number; angle: number }[] = [];
  private ramps: { x: number; y: number; angle: number }[] = [];
  /** Sampled shortcut centerlines (narrow risky cuts off the main road). */
  private shortcutLines: { x: number; y: number }[][] = [];
  private shortcutHalf = 52;
  private crossings: Crossing[] = [];
  /** Index half-width of a bridge zone in path samples. */
  private crossingSpan = 9;

  // Wasteland blackouts: pitch black except headlights, exhaust, outline.
  private blackoutWindows: { start: number; end: number }[] = [];
  private blackoutAlpha = 0;
  private blackoutActive = false;
  private darkness?: Phaser.GameObjects.RenderTexture;
  private outlineGfx?: Phaser.GameObjects.Graphics;

  phase: 'countdown' | 'racing' | 'done' = 'countdown';
  private raceStart = 0;
  private countdownStep = 0;
  lapsTotal = 3;
  private finishedCount = 0;
  private pickupsCollected = 0;
  private offRoad = false;

  constructor() {
    super('race');
  }

  /** Shared world seed (multiplayer clients pass the host's). */
  worldSeed = 0;
  private rand: () => number = Math.random;

  init(data: { trackId?: string; ghost?: GhostData; seed?: number; network?: NetworkData }): void {
    this.save = loadSave();
    this.net = data.network;
    this.remoteTargets = new Map();
    this.lastNetSend = 0;
    this.worldSeed = data.seed ?? Math.floor(Math.random() * 2 ** 31);
    this.rand = mulberry32(this.worldSeed);
    this.ghostData = data.ghost;
    // A ghost challenge always races on the ghost's track.
    this.track = trackById(this.ghostData?.trackId ?? data.trackId ?? 'city-gp');
    this.ghostPlayer = this.ghostData ? new GhostPlayer(this.ghostData) : undefined;
    this.recorder = new GhostRecorder();
    this.buildings = [];
    this.props = [];
    this.lastBumpAt = 0;
    this.path = buildPath(this.track.controlPoints);
    this.lapsTotal = this.track.laps;
    this.racers = [];
    this.pickups = [];
    this.hazards = [];
    this.phase = 'countdown';
    this.countdownStep = 0;
    this.finishedCount = 0;
    this.pickupsCollected = 0;
    this.offRoad = false;
    this.blackoutWindows = [];
    this.blackoutAlpha = 0;
    this.blackoutActive = false;
    this.darkness = undefined;
    this.outlineGfx = undefined;
    this.bombs = [];
    this.fireballs = [];
    this.fireQueued = false;
    this.pads = [];
    this.ramps = [];
    // Computed here (pure math) so scenery placement can steer clear.
    this.shortcutLines = (this.track.shortcuts ?? []).map((def) => this.shortcutSamples(def));
    this.crossings = findCrossings(this.path, this.track.roadWidth);
    // Weapons: front-page toggle; off in network races (not synced yet).
    this.shootingOn = this.save.shootingEnabled && !data.network;
  }

  /** Blackouts follow the front-page per-track toggle. */
  private get hasBlackouts(): boolean {
    return this.save.blackoutTracks[this.track.id] ?? false;
  }

  create(): void {
    const size = this.track.size;

    if (this.track.daylight) {
      this.add.tileSprite(size / 2, size / 2, size, size, `floor-${this.track.envId}-day`);
    } else {
      this.add.tileSprite(size / 2, size / 2, size, size, `floor-${this.track.envId}`).setAlpha(0.55);
    }
    this.drawScenery();
    this.drawShortcuts();
    this.drawTrack();
    this.placePadsAndRamps();
    this.drawBridges();
    this.spawnTrackside();

    // Grid: staggered two-wide slots walked back along the centerline, so
    // rows sit on the road even through a curve — and far enough apart
    // that the pack doesn't pile up the instant the lights go green.
    const startIdx = 0;
    const n = this.path.pts.length;
    const startPt = this.path.pts[startIdx];
    /** Path sample index `dist` px behind the start line. */
    const idxBehind = (dist: number): number => {
      let i = startIdx;
      let acc = 0;
      while (acc < dist) {
        const j = (i - 1 + n) % n;
        acc += Math.hypot(this.path.pts[i].x - this.path.pts[j].x, this.path.pts[i].y - this.path.pts[j].y);
        i = j;
      }
      return i;
    };

    const classDef = CAR_CLASSES.find((c) => c.id === this.save.selectedCar) ?? CAR_CLASSES[0];
    const playerDriver = new PlayerDriver(this, 'YOU');

    // Build the starting roster: real friends in multiplayer, bots solo.
    // The shared players-array order gives every client the same grid.
    interface RosterSlot {
      kind: 'player' | 'bot' | 'remote';
      name: string;
      fuel: ReturnType<typeof fuelById>;
      netId?: string;
    }
    const roster: RosterSlot[] = [];
    if (this.net) {
      for (const p of this.net.players) {
        if (p.id === this.net.room.myId) {
          roster.push({ kind: 'player', name: 'YOU', fuel: fuelById(p.fuel) });
        } else {
          roster.push({ kind: 'remote', name: p.name, fuel: fuelById(p.fuel), netId: p.id });
        }
      }
    } else {
      roster.push({ kind: 'player', name: 'YOU', fuel: fuelById(this.save.selectedFuel) });
      for (const n of botNames(this.track.botCount)) {
        roster.push({ kind: 'bot', name: n, fuel: randomFuel() });
      }
    }

    for (let slot = 0; slot < roster.length; slot++) {
      const spec = roster[slot];
      const row = Math.floor(slot / 2);
      const col = slot % 2 === 0 ? -1 : 1;
      // F1-style stagger: the right column sits half a row further back.
      const back = 90 + row * 150 + (col > 0 ? 70 : 0);
      const gi = idxBehind(back);
      const gp = this.path.pts[gi];
      const ga = this.path.pts[(gi + 3) % n];
      const gridAngle = Math.atan2(ga.y - gp.y, ga.x - gp.x);
      const gx = gp.x + Math.cos(gridAngle + Math.PI / 2) * col * 55;
      const gy = gp.y + Math.sin(gridAngle + Math.PI / 2) * col * 55;

      let driver: Driver;
      let stats;
      if (spec.kind === 'player') {
        driver = playerDriver;
        stats = effectiveStats(classDef.id, this.save.upgrades[classDef.id] ?? {});
      } else if (spec.kind === 'bot') {
        const botClass = CAR_CLASSES[Math.floor(Math.random() * CAR_CLASSES.length)];
        driver = new RaceBotDriver(spec.name, this.path, startIdx);
        // Some rivals are genuinely faster than a stock player car.
        const variance = 0.98 + Math.random() * 0.1;
        stats = { ...botClass.base, topSpeed: botClass.base.topSpeed * variance };
      } else {
        driver = idleDriver;
        stats = { ...CAR_CLASSES[0].base };
      }

      // Fuel type sets the car's look: shape, color, exhaust.
      const fuel = spec.fuel;
      const car = new CarSim(slot + 1, driver, stats, fuel.color, []);
      car.freeBoost = true; // race mode: boost burns fuel only, Nitro style
      car.fuelId = fuel.id;
      car.spawnAt(gx, gy, gridAngle);

      const sprite = this.add.image(0, 0, fuel.texture).setScale(CAR_SCALE).setTint(fuel.color);
      const shadow = this.add.image(0, 0, fuel.texture).setScale(CAR_SCALE).setTintFill(0x000000).setAlpha(0).setVisible(false);
      const label = this.add
        .text(0, -46, spec.kind === 'player' ? 'YOU' : spec.name, {
          fontFamily: '"Segoe UI", Arial, sans-serif',
          fontSize: '13px',
          color: spec.kind === 'player' ? '#ffffff' : spec.kind === 'remote' ? '#ffe9a8' : '#a9c1e8',
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(0.5);
      const container = this.add.container(gx, gy, [shadow, sprite, label]).setDepth(10);
      const flames = new ExhaustFx(this, car, fuel);

      const entry: RacerEntry = {
        car,
        driver,
        tracker: new LapTracker(this.path, startIdx),
        view: { container, sprite, shadow, label, flames },
        finished: false,
        finishTime: 0,
        ammo: this.shootingOn ? 1 : 0,
        lastFireAt: 0,
        netId: spec.netId,
      };
      if (spec.kind === 'player') {
        this.player = entry;
        playerDriver.car = car;
      } else if (spec.kind === 'bot') {
        (driver as RaceBotDriver).car = car;
      }
      this.racers.push(entry);
    }

    // Live multiplayer: receive rival positions.
    if (this.net) {
      this.net.room.onState = (msg) => this.remoteTargets.set(msg.id, msg);
    }

    // Camera.
    const cam = this.cameras.main;
    cam.setBounds(0, 0, size, size);
    cam.startFollow(this.player.view.container, false, 0.09, 0.09);
    const zoom = Phaser.Math.Clamp(Math.min(this.scale.width, this.scale.height) / 900, 0.55, 1.15);
    cam.setZoom(zoom);
    if (this.renderer.type === Phaser.WEBGL) {
      cam.postFX.addBloom(0xffffff, 1, 1, 1.1, 0.6);
    }

    // A challenger's ghost car: translucent, no collision, pure replay.
    if (this.ghostData) {
      const ghostImg = this.add.image(0, 0, 'car-sports').setScale(CAR_SCALE).setTint(0xd8e8ff).setAlpha(0.4);
      const ghostLabel = this.add
        .text(0, -46, `👻 ${this.ghostData.name}`, {
          fontFamily: '"Segoe UI", Arial, sans-serif',
          fontSize: '13px',
          color: '#cfe0ff',
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setAlpha(0.75);
      this.ghostSprite = this.add.container(startPt.x, startPt.y, [ghostImg, ghostLabel]).setDepth(8);
    }

    if (this.hasBlackouts) this.setupBlackouts();

    this.scene.launch('racehud', { track: this.track, path: this.path });
    sfx.startEngine(this.save.selectedFuel);
    music.start();
    this.input.once('pointerdown', () => music.start());

    this.runCountdown();

    this.input.keyboard!.on('keydown-ESC', () => this.quitRace());
    this.input.keyboard!.on('keydown-F', () => {
      this.fireQueued = true;
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      sfx.stopEngine();
      if (this.net) this.net.room.onState = undefined;
    });
  }

  // ---------- Track rendering ----------

  private drawTrack(): void {
    const pal = ENV_PALETTES[this.track.envId];
    const g = this.add.graphics().setDepth(1);
    const pts = this.path.pts;
    const w = this.track.roadWidth;
    const day = this.track.daylight;

    // Daylight looks per environment: city asphalt with gold curbs,
    // forest packed dirt, desert hard-baked sand road. Night: neon.
    const forest = this.track.envId === 'forest';
    const desert = this.track.envId === 'desert';
    const passes: [number, number, number][] = day
      ? forest
        ? [
            [w + 24, 0x3e4a2c, 1], // grass-shadow shoulder
            [w + 10, 0x8a6a3c, 0.8], // earth berm
            [w, 0x74603e, 1], // packed dirt
          ]
        : desert
          ? [
              [w + 24, 0x6e5a38, 1], // shadowed dune shoulder
              [w + 10, 0xa8905c, 0.85], // sand berm
              [w, 0x8f7648, 1], // hard-baked sand road
            ]
          : [
              [w + 22, 0x55555d, 1], // curb/shadow edge
              [w + 10, 0xb9902c, 0.65], // gold curb line
              [w, 0x6e6e76, 1], // asphalt
            ]
      : [
          [w + 18, pal.wall, 0.18],
          [w + 6, 0x05050d, 1],
          [w, 0x15151f, 1],
        ];
    for (const [width, color, alpha] of passes) {
      g.lineStyle(width, color, alpha);
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.closePath();
      g.strokePath();
    }
    // Center line dashes — white on asphalt, ruts on dirt/sand, violet at night.
    g.lineStyle(day ? 5 : 4, day ? (forest ? 0x5c4a30 : desert ? 0xdcc89a : 0xe8e8ec) : 0x3a3a5c, 0.9);
    for (let i = 0; i < pts.length; i += 6) {
      const a = pts[i];
      const b = pts[(i + 3) % pts.length];
      g.lineBetween(a.x, a.y, b.x, b.y);
    }

    // Checkered start/finish line across the road (rotated to the track).
    const start = pts[0];
    const next = pts[3];
    const tangent = Math.atan2(next.y - start.y, next.x - start.x);
    const across = tangent + Math.PI / 2;
    const cells = 8;
    const cell = w / cells;
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < cells; i++) {
        const off = -w / 2 + i * cell + cell / 2;
        const along = (row - 0.5) * cell;
        this.add
          .rectangle(
            start.x + Math.cos(across) * off + Math.cos(tangent) * along,
            start.y + Math.sin(across) * off + Math.sin(tangent) * along,
            cell,
            cell,
            (i + row) % 2 === 0 ? 0xffffff : 0x0a0a14,
            0.95,
          )
          .setRotation(tangent)
          .setDepth(2);
      }
    }
  }

  /**
   * Trackside scenery in the original's city style: gray rooftops with
   * gold brick edging, red/white shop awnings facing the road, and
   * crates/vents scattered on the sidewalks.
   */
  private drawScenery(): void {
    if (!this.track.daylight) {
      if (this.track.envId === 'wasteland') this.drawWastelandScenery();
      if (this.track.envId === 'city') this.drawNightCityScenery();
      return;
    }
    if (this.track.envId === 'forest') {
      this.drawForestScenery();
      return;
    }
    if (this.track.envId === 'desert') {
      this.drawDesertScenery();
      return;
    }
    const size = this.track.size;
    const roadHalf = this.track.roadWidth / 2;
    const pts = this.path.pts;

    const minDistToRoad = (x: number, y: number): number => this.minDistToTrack(x, y);
    const nearestRoadPoint = (x: number, y: number): { x: number; y: number } => {
      let best = pts[0];
      let bestD2 = Infinity;
      for (let i = 0; i < pts.length; i += 2) {
        const dx = pts[i].x - x;
        const dy = pts[i].y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = pts[i];
        }
      }
      return best;
    };

    const g = this.add.graphics().setDepth(0.5);
    const placed: { x: number; y: number; r: number }[] = [];
    let buildings = 0;

    for (let tries = 0; tries < 700 && buildings < 48; tries++) {
      const bw = 170 + this.rand() * 220;
      const bh = 170 + this.rand() * 220;
      const x = 120 + this.rand() * (size - 240 - bw);
      const y = 120 + this.rand() * (size - 240 - bh);
      const cx = x + bw / 2;
      const cy = y + bh / 2;
      const halfDiag = Math.hypot(bw, bh) / 2;

      const roadDist = minDistToRoad(cx, cy);
      if (roadDist < roadHalf + halfDiag * 0.82 + 26) continue;
      if (roadDist > 1400 && this.rand() < 0.6) continue; // keep density near the track
      if (placed.some((p) => Math.hypot(p.x - cx, p.y - cy) < (p.r + halfDiag) * 0.85)) continue;
      placed.push({ x: cx, y: cy, r: halfDiag });
      this.buildings.push({ x, y, w: bw, h: bh });
      buildings++;

      // Drop shadow, gold brick border, gray rooftop.
      g.fillStyle(0x3c3c44, 0.3).fillRect(x + 10, y + 10, bw, bh);
      g.fillStyle(0xb9902c, 1).fillRect(x, y, bw, bh);
      g.fillStyle(0x8a6a1c, 0.55);
      for (let i = 0; i < bw; i += 20) {
        g.fillRect(x + i, y, 2.5, 15);
        g.fillRect(x + i + 10, y + bh - 15, 2.5, 15);
      }
      for (let i = 0; i < bh; i += 20) {
        g.fillRect(x, y + i, 15, 2.5);
        g.fillRect(x + bw - 15, y + i + 10, 15, 2.5);
      }
      g.fillStyle(0x84848c, 1).fillRect(x + 15, y + 15, bw - 30, bh - 30);
      g.fillStyle(0x74747e, 0.6);
      for (let s = 0; s < 14; s++) {
        g.fillRect(x + 20 + this.rand() * (bw - 50), y + 20 + this.rand() * (bh - 50), 8, 8);
      }

      // Roof vents.
      const vents = 1 + Math.floor(this.rand() * 3);
      for (let v = 0; v < vents; v++) {
        this.add
          .image(x + 35 + this.rand() * (bw - 70), y + 35 + this.rand() * (bh - 70), 'vent')
          .setDepth(0.6)
          .setRotation(this.rand() < 0.5 ? 0 : Math.PI / 2);
      }

      // Road-facing buildings get a striped shop awning on the near edge.
      if (roadDist < roadHalf + halfDiag + 260) {
        const road = nearestRoadPoint(cx, cy);
        const toRoad = Math.atan2(road.y - cy, road.x - cx);
        const edgeDist = Math.min(bw, bh) / 2;
        this.add
          .image(cx + Math.cos(toRoad) * (edgeDist + 8), cy + Math.sin(toRoad) * (edgeDist + 8), 'awning')
          .setRotation(toRoad + Math.PI / 2)
          .setDepth(5);
      }
    }

    // Crates and vents on the sidewalk just off the road edge.
    for (let i = 0; i < 34; i++) {
      const idx = Math.floor(this.rand() * pts.length);
      const p = pts[idx];
      const q = pts[(idx + 1) % pts.length];
      const tangent = Math.atan2(q.y - p.y, q.x - p.x);
      const side = this.rand() < 0.5 ? 1 : -1;
      const lateral = roadHalf + 40 + this.rand() * 70;
      const ox = p.x + Math.cos(tangent + Math.PI / 2) * lateral * side;
      const oy = p.y + Math.sin(tangent + Math.PI / 2) * lateral * side;
      if (ox < 60 || oy < 60 || ox > size - 60 || oy > size - 60) continue;
      const scale = 0.9 + this.rand() * 0.5;
      this.add
        .image(ox, oy, this.rand() < 0.7 ? 'crate' : 'vent')
        .setDepth(0.7)
        .setRotation(this.rand() * 0.5 - 0.25)
        .setScale(scale);
      this.props.push({ x: ox, y: oy, r: 15 * scale });
    }
  }

  /** Forest Rally trackside: dense tree canopies (solid) + logs. */
  private drawForestScenery(): void {
    const size = this.track.size;
    const roadHalf = this.track.roadWidth / 2;
    const pts = this.path.pts;
    const minDistToRoad = (x: number, y: number): number => this.minDistToTrack(x, y);

    const g = this.add.graphics().setDepth(0.5);
    const placed: { x: number; y: number; r: number }[] = [];
    let trees = 0;
    for (let tries = 0; tries < 1200 && trees < 150; tries++) {
      const r = 26 + this.rand() * 36;
      const x = 80 + this.rand() * (size - 160);
      const y = 80 + this.rand() * (size - 160);
      const roadDist = minDistToRoad(x, y);
      if (roadDist < roadHalf + r + 24) continue;
      if (roadDist > 950 && this.rand() < 0.55) continue; // denser near the road
      if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < (p.r + r) * 0.9)) continue;
      placed.push({ x, y, r });
      trees++;

      g.fillStyle(0x243c1c, 0.4).fillCircle(x + 8, y + 8, r); // shadow
      g.fillStyle(0x2e5c30, 1).fillCircle(x, y, r);
      g.fillStyle(0x3f7a40, 1).fillCircle(x - r * 0.22, y - r * 0.22, r * 0.64);
      g.fillStyle(0x54985a, 0.85).fillCircle(x - r * 0.34, y - r * 0.34, r * 0.32);
      this.props.push({ x, y, r: r * 0.8 });
    }

    // Fallen logs / crates near the road edge.
    for (let i = 0; i < 16; i++) {
      const idx = Math.floor(this.rand() * pts.length);
      const p = pts[idx];
      const q = pts[(idx + 1) % pts.length];
      const tangent = Math.atan2(q.y - p.y, q.x - p.x);
      const side = this.rand() < 0.5 ? 1 : -1;
      const lateral = roadHalf + 34 + this.rand() * 60;
      const ox = p.x + Math.cos(tangent + Math.PI / 2) * lateral * side;
      const oy = p.y + Math.sin(tangent + Math.PI / 2) * lateral * side;
      if (ox < 60 || oy < 60 || ox > size - 60 || oy > size - 60) continue;
      const scale = 0.9 + this.rand() * 0.4;
      this.add.image(ox, oy, 'crate').setDepth(0.7).setRotation(this.rand() * Math.PI).setScale(scale);
      this.props.push({ x: ox, y: oy, r: 15 * scale });
    }
  }

  /** Synthwave city blocks: dark rooftops rimmed in neon (solid). */
  private drawNightCityScenery(): void {
    const size = this.track.size;
    const roadHalf = this.track.roadWidth / 2;
    const minDistToRoad = (x: number, y: number): number => this.minDistToTrack(x, y);

    const g = this.add.graphics().setDepth(0.5);
    const placed: { x: number; y: number; r: number }[] = [];
    const neon = [0xff3b9e, 0x19c8ff, 0x9d5cff];
    let blocks = 0;
    for (let tries = 0; tries < 700 && blocks < 40; tries++) {
      const bw = 180 + this.rand() * 220;
      const bh = 180 + this.rand() * 220;
      const x = 120 + this.rand() * (size - 240 - bw);
      const y = 120 + this.rand() * (size - 240 - bh);
      const cx = x + bw / 2;
      const cy = y + bh / 2;
      const halfDiag = Math.hypot(bw, bh) / 2;
      const roadDist = minDistToRoad(cx, cy);
      if (roadDist < roadHalf + halfDiag * 0.82 + 26) continue;
      if (roadDist > 1400 && this.rand() < 0.6) continue;
      if (placed.some((p) => Math.hypot(p.x - cx, p.y - cy) < (p.r + halfDiag) * 0.85)) continue;
      placed.push({ x: cx, y: cy, r: halfDiag });
      this.buildings.push({ x, y, w: bw, h: bh });
      blocks++;

      const rim = neon[Math.floor(this.rand() * neon.length)];
      g.fillStyle(0x07070f, 0.9).fillRect(x, y, bw, bh);
      g.lineStyle(3, rim, 0.85).strokeRect(x, y, bw, bh);
      g.lineStyle(8, rim, 0.12).strokeRect(x - 4, y - 4, bw + 8, bh + 8); // glow halo
      // A few lit windows.
      g.fillStyle(rim, 0.35);
      const cols = Math.max(2, Math.floor(bw / 90));
      const rows = Math.max(2, Math.floor(bh / 90));
      for (let wx = 0; wx < cols; wx++) {
        for (let wy = 0; wy < rows; wy++) {
          if (this.rand() < 0.55) continue;
          g.fillRect(x + 24 + wx * ((bw - 48) / cols), y + 24 + wy * ((bh - 48) / rows), 16, 16);
        }
      }
    }
  }

  /** Solid scenery: push the car out and bounce it off buildings/props. */
  private collideScenery(car: CarSim, time: number, isPlayer: boolean): void {
    const bounce = (nx: number, ny: number, pen: number): void => {
      car.x += nx * pen;
      car.y += ny * pen;
      const dot = car.vx * nx + car.vy * ny;
      if (dot < 0) {
        const e = 0.45; // restitution — a solid thud with a visible rebound
        car.vx -= (1 + e) * dot * nx;
        car.vy -= (1 + e) * dot * ny;
        car.speed *= 0.45;
        if (isPlayer && time - this.lastBumpAt > 250) {
          this.lastBumpAt = time;
          sfx.bump();
          this.cameras.main.shake(90, 0.004);
        }
      }
    };

    for (const b of this.buildings) {
      const cx = Phaser.Math.Clamp(car.x, b.x, b.x + b.w);
      const cy = Phaser.Math.Clamp(car.y, b.y, b.y + b.h);
      let dx = car.x - cx;
      let dy = car.y - cy;
      let d2 = dx * dx + dy * dy;
      if (d2 >= CAR_RADIUS * CAR_RADIUS) continue;
      if (d2 < 0.001) {
        // Center inside the rect (teleport edge case): push toward nearest edge.
        dx = car.x - (b.x + b.w / 2);
        dy = car.y - (b.y + b.h / 2);
        d2 = dx * dx + dy * dy || 1;
      }
      const d = Math.sqrt(d2);
      bounce(dx / d, dy / d, CAR_RADIUS - Math.min(d, CAR_RADIUS));
    }

    for (const p of this.props) {
      const dx = car.x - p.x;
      const dy = car.y - p.y;
      const minD = CAR_RADIUS + p.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minD * minD || d2 < 0.001) continue;
      const d = Math.sqrt(d2);
      bounce(dx / d, dy / d, minD - d);
    }
  }

  /** Toxic Wasteland trackside: neon-rimmed rocks (solid) + glowing pools. */
  private drawWastelandScenery(): void {
    const size = this.track.size;
    const roadHalf = this.track.roadWidth / 2;
    const minDistToRoad = (x: number, y: number): number => this.minDistToTrack(x, y);

    const g = this.add.graphics().setDepth(0.5);
    const placed: { x: number; y: number; r: number }[] = [];

    // Jagged dark rocks with a magenta neon rim.
    let rocks = 0;
    for (let tries = 0; tries < 900 && rocks < 60; tries++) {
      const r = 26 + this.rand() * 36;
      const x = 90 + this.rand() * (size - 180);
      const y = 90 + this.rand() * (size - 180);
      const roadDist = minDistToRoad(x, y);
      if (roadDist < roadHalf + r + 28) continue;
      if (roadDist > 1000 && this.rand() < 0.55) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < (p.r + r) * 0.95)) continue;
      placed.push({ x, y, r });
      rocks++;

      g.lineStyle(3, 0xff2ec4, 0.35).strokeCircle(x, y, r + 2);
      g.fillStyle(0x1c1024, 1).fillCircle(x, y, r);
      g.fillStyle(0x2e1c3a, 1).fillCircle(x - r * 0.2, y - r * 0.25, r * 0.6);
      g.fillStyle(0x3e2850, 0.9).fillCircle(x - r * 0.32, y - r * 0.35, r * 0.3);
      this.props.push({ x, y, r: r * 0.85 });
    }

    // Glowing toxic pools (decorative, off the racing line).
    for (let i = 0; i < 30; i++) {
      const x = 90 + this.rand() * (size - 180);
      const y = 90 + this.rand() * (size - 180);
      if (minDistToRoad(x, y) < roadHalf + 60) continue;
      const s = 1.6 + this.rand() * 2.4;
      this.add
        .image(x, y, 'orb')
        .setTint(0x7aff4a)
        .setAlpha(0.3)
        .setScale(s)
        .setDepth(0.6);
    }
  }

  /** Desert Dunes trackside: rock formations (solid) and saguaro cacti. */
  private drawDesertScenery(): void {
    const size = this.track.size;
    const roadHalf = this.track.roadWidth / 2;
    const minDistToRoad = (x: number, y: number): number => this.minDistToTrack(x, y);

    const g = this.add.graphics().setDepth(0.5);
    const placed: { x: number; y: number; r: number }[] = [];

    // Rock formations: clusters of overlapping boulders.
    let rocks = 0;
    for (let tries = 0; tries < 900 && rocks < 70; tries++) {
      const r = 24 + this.rand() * 34;
      const x = 90 + this.rand() * (size - 180);
      const y = 90 + this.rand() * (size - 180);
      const roadDist = minDistToRoad(x, y);
      if (roadDist < roadHalf + r + 26) continue;
      if (roadDist > 1000 && this.rand() < 0.55) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < (p.r + r) * 0.95)) continue;
      placed.push({ x, y, r });
      rocks++;

      g.fillStyle(0x6e5a40, 0.4).fillCircle(x + 7, y + 7, r); // shadow
      g.fillStyle(0x9a815c, 1).fillCircle(x, y, r);
      g.fillStyle(0xb09a70, 1).fillCircle(x - r * 0.2, y - r * 0.25, r * 0.62);
      g.fillStyle(0x86704e, 0.9).fillCircle(x + r * 0.3, y + r * 0.25, r * 0.4);
      this.props.push({ x, y, r: r * 0.85 });
    }

    // Saguaro cacti: green pillar + two arms.
    let cacti = 0;
    for (let tries = 0; tries < 500 && cacti < 45; tries++) {
      const r = 11 + this.rand() * 8;
      const x = 90 + this.rand() * (size - 180);
      const y = 90 + this.rand() * (size - 180);
      const roadDist = minDistToRoad(x, y);
      if (roadDist < roadHalf + r + 30) continue;
      if (roadDist > 800 && this.rand() < 0.5) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + r + 12)) continue;
      placed.push({ x, y, r: r + 8 });
      cacti++;

      g.fillStyle(0x2c5c28, 0.4).fillCircle(x + 4, y + 4, r);
      g.fillStyle(0x3e8a38, 1).fillCircle(x, y, r);
      g.fillStyle(0x54a84c, 1).fillCircle(x - r * 0.25, y - r * 0.25, r * 0.55);
      // Arms.
      g.fillStyle(0x3e8a38, 1).fillCircle(x - r * 1.1, y - r * 0.4, r * 0.45);
      g.fillStyle(0x3e8a38, 1).fillCircle(x + r * 1.05, y + r * 0.5, r * 0.4);
      this.props.push({ x, y, r: r * 1.1 });
    }

    // Decorative dry scrub (no collision).
    for (let i = 0; i < 60; i++) {
      const x = 80 + this.rand() * (size - 160);
      const y = 80 + this.rand() * (size - 160);
      if (minDistToRoad(x, y) < roadHalf + 30) continue;
      g.fillStyle(0xa8905c, 0.5).fillCircle(x, y, 5 + this.rand() * 7);
    }
  }

  private pointOnTrack(minGapFromStart = 25): { x: number; y: number; idx: number } {
    const n = this.path.pts.length;
    const idx = (minGapFromStart + Math.floor(this.rand() * (n - minGapFromStart * 2))) % n;
    const p = this.path.pts[idx];
    const q = this.path.pts[(idx + 1) % n];
    const tangent = Math.atan2(q.y - p.y, q.x - p.x);
    const lateral = (this.rand() - 0.5) * (this.track.roadWidth - 60);
    return {
      x: p.x + Math.cos(tangent + Math.PI / 2) * lateral,
      y: p.y + Math.sin(tangent + Math.PI / 2) * lateral,
      idx,
    };
  }

  private spawnTrackside(): void {
    for (let i = 0; i < this.track.fuelPickups; i++) this.spawnPickup('fuel');
    for (let i = 0; i < this.track.barrels; i++) this.spawnPickup('barrel');
    if (this.shootingOn) {
      for (let i = 0; i < 8; i++) this.spawnPickup('ammo');
    }
    for (let i = 0; i < 5; i++) this.spawnBomb();

    const defs: { kind: 'oil' | 'cone' | 'pothole'; count: number; texture: string; r: number }[] = [
      { kind: 'oil', count: this.track.hazards.oil, texture: 'oil', r: 34 },
      { kind: 'cone', count: this.track.hazards.cones, texture: 'cone', r: 14 },
      { kind: 'pothole', count: this.track.hazards.potholes, texture: 'pothole', r: 20 },
    ];
    for (const def of defs) {
      for (let i = 0; i < def.count; i++) {
        const pos = this.pointOnTrack(30);
        const sprite = this.add.image(pos.x, pos.y, def.texture).setDepth(3);
        this.hazards.push({ kind: def.kind, x: pos.x, y: pos.y, r: def.r, sprite });
      }
    }
  }

  private spawnPickup(kind: 'fuel' | 'barrel' | 'ammo', existing?: TrackPickup): void {
    const pos = this.pointOnTrack(20);
    if (existing) {
      existing.x = pos.x;
      existing.y = pos.y;
      existing.active = true;
      existing.sprite.setPosition(pos.x, pos.y).setVisible(true);
      return;
    }
    const texture = kind === 'fuel' ? 'pickup-fuel' : kind === 'barrel' ? 'pickup-barrel' : 'pickup-ammo';
    const sprite = this.add.image(pos.x, pos.y, texture).setDepth(4);
    if (kind === 'barrel') {
      this.tweens.add({ targets: sprite, scale: { from: 1, to: 1.15 }, yoyo: true, repeat: -1, duration: 550, ease: 'Sine.inOut' });
    }
    this.pickups.push({ kind, x: pos.x, y: pos.y, sprite, active: true, respawnAt: 0 });
  }

  private spawnBomb(existing?: Bomb): void {
    let pos = this.pointOnTrack(35);
    // Keep bombs away from bridge crossings — a fuse lit through the deck
    // from the other level would feel like a cheap shot.
    for (let tries = 0; tries < 8 && this.crossings.some((c) => Math.hypot(c.x - pos.x, c.y - pos.y) < this.track.roadWidth * 2); tries++) {
      pos = this.pointOnTrack(35);
    }
    if (existing) {
      existing.x = pos.x;
      existing.y = pos.y;
      existing.active = true;
      existing.explodeAt = 0;
      existing.sprite.setPosition(pos.x, pos.y).setVisible(true).setTint(0xffffff);
      existing.ember.setPosition(pos.x + 19, pos.y - 24).setVisible(true);
      return;
    }
    const sprite = this.add.image(pos.x, pos.y, 'bomb').setDepth(4);
    // Burning fuse ember, pulsing.
    const ember = this.add.image(pos.x + 19, pos.y - 24, 'dot').setTint(0xffd040).setDepth(5).setScale(0.9);
    this.tweens.add({
      targets: ember,
      scale: { from: 0.6, to: 1.4 },
      alpha: { from: 0.7, to: 1 },
      yoyo: true,
      repeat: -1,
      duration: 180,
    });
    this.bombs.push({ x: pos.x, y: pos.y, sprite, ember, active: true, explodeAt: 0, respawnAt: 0 });
  }

  // ---------- Track features: shortcuts, pads, ramps, bridges ----------

  /** Sample a shortcut's centerline as a shallow quadratic arc. */
  private shortcutSamples(def: { from: number; to: number; bulge?: number }): { x: number; y: number }[] {
    const spacing = 18; // samples per control segment in buildPath
    const a = this.path.pts[(def.from * spacing) % this.path.pts.length];
    const b = this.path.pts[(def.to * spacing) % this.path.pts.length];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const px = -(b.y - a.y) / len;
    const py = (b.x - a.x) / len;
    const bulge = def.bulge ?? 0;
    const cx = mx + px * bulge;
    const cy = my + py * bulge;
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i <= 26; i++) {
      const t = i / 26;
      const u = 1 - t;
      out.push({ x: u * u * a.x + 2 * u * t * cx + t * t * b.x, y: u * u * a.y + 2 * u * t * cy + t * t * b.y });
    }
    return out;
  }

  /** Narrow risky dirt cuts drawn beneath the main road. */
  private drawShortcuts(): void {
    for (const line of this.shortcutLines) {
      const g = this.add.graphics().setDepth(0.85);
      const day = this.track.daylight;
      const surface = day ? (this.track.envId === 'desert' ? 0x9a8050 : 0x7a6a48) : 0x101018;
      const edge = day ? 0x4a4034 : 0x3a3a6c;
      g.lineStyle(this.shortcutHalf * 2 + 10, edge, day ? 0.55 : 0.8);
      this.strokePolyline(g, line);
      g.lineStyle(this.shortcutHalf * 2, surface, 1);
      this.strokePolyline(g, line);
      // Dashed hints so the entrance reads as a path, not a glitch.
      g.lineStyle(4, day ? 0xd8c890 : 0x5c5c8c, 0.8);
      for (let i = 2; i < line.length - 3; i += 4) {
        g.lineBetween(line[i].x, line[i].y, line[i + 2].x, line[i + 2].y);
      }
    }
  }

  private strokePolyline(g: Phaser.GameObjects.Graphics, line: { x: number; y: number }[]): void {
    g.beginPath();
    g.moveTo(line[0].x, line[0].y);
    for (let i = 1; i < line.length; i++) g.lineTo(line[i].x, line[i].y);
    g.strokePath();
  }

  /**
   * Distance to the nearest drivable surface (main road OR shortcut) —
   * scenery placement keeps this clear so cuts are never walled off.
   * Shortcut distance is padded up so road-width clearance thresholds
   * apply to the narrower cut too.
   */
  private minDistToTrack(x: number, y: number): number {
    const pts = this.path.pts;
    let best = Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      const dx = pts[i].x - x;
      const dy = pts[i].y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) best = d2;
    }
    let d = Math.sqrt(best);
    if (this.shortcutLines.length > 0) {
      const pad = Math.max(0, this.track.roadWidth / 2 - this.shortcutHalf);
      d = Math.min(d, this.distToShortcut(x, y) + pad);
    }
    return d;
  }

  /** Distance from a point to the nearest shortcut centerline sample. */
  private distToShortcut(x: number, y: number): number {
    let best = Infinity;
    for (const line of this.shortcutLines) {
      for (const p of line) {
        const d2 = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
        if (d2 < best) best = d2;
      }
    }
    return Math.sqrt(best);
  }

  /**
   * Deterministically place boost pads and jump ramps on straights (same
   * result on every client — no RNG involved).
   */
  private placePadsAndRamps(): void {
    const pts = this.path.pts;
    const n = pts.length;
    const tangentAt = (i: number): number => {
      const a = pts[(i - 2 + n) % n];
      const b = pts[(i + 2) % n];
      return Math.atan2(b.y - a.y, b.x - a.x);
    };
    const bendOver = (i: number, span: number): number => {
      let worst = 0;
      for (let k = 0; k <= span; k += 2) {
        let d = tangentAt((i + k) % n) - tangentAt(i);
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        worst = Math.max(worst, Math.abs(d));
      }
      return worst;
    };
    // Rank every sample by straightness and take the best spots — adaptive,
    // so even twisty tracks get their features on their straightest bits.
    const taken: number[] = [];
    const farFromTaken = (i: number, gap: number): boolean => taken.every((t) => Math.min(Math.abs(i - t), n - Math.abs(i - t)) > gap);
    const nearBridge = (i: number): boolean =>
      this.crossings.some(
        (c) =>
          Math.min(Math.abs(i - c.overIdx), n - Math.abs(i - c.overIdx)) < this.crossingSpan + 10 ||
          Math.min(Math.abs(i - c.underIdx), n - Math.abs(i - c.underIdx)) < this.crossingSpan + 10,
      );
    const scored: { i: number; bend: number; landing: number }[] = [];
    for (let i = 20; i < n - 8; i += 2) {
      if (nearBridge(i)) continue;
      scored.push({ i, bend: bendOver(i, 12), landing: bendOver(i, 24) });
    }

    // Two ramps where the landing run is straightest.
    for (const c of [...scored].sort((a, b) => a.landing - b.landing)) {
      if (this.ramps.length >= 2) break;
      if (!farFromTaken(c.i, 40) || c.landing > 0.55) continue;
      const angle = tangentAt(c.i);
      this.ramps.push({ x: pts[c.i].x, y: pts[c.i].y, angle });
      this.add.image(pts[c.i].x, pts[c.i].y, 'ramp').setRotation(angle).setDepth(2.5);
      taken.push(c.i);
    }
    // Four boost pads on the next-straightest spots.
    for (const c of [...scored].sort((a, b) => a.bend - b.bend)) {
      if (this.pads.length >= 4) break;
      if (!farFromTaken(c.i, 30) || c.bend > 0.6) continue;
      const angle = tangentAt(c.i);
      this.pads.push({ x: pts[c.i].x, y: pts[c.i].y, angle });
      const img = this.add.image(pts[c.i].x, pts[c.i].y, 'pad-boost').setRotation(angle).setDepth(2.5);
      this.tweens.add({ targets: img, alpha: { from: 1, to: 0.55 }, yoyo: true, repeat: -1, duration: 420 });
      taken.push(c.i);
    }
  }

  /** Which level an on-track sample index is on near a crossing: 1 = bridge, 0 = under, -1 = away. */
  private levelAtIdx(idx: number): number {
    const n = this.path.pts.length;
    for (const c of this.crossings) {
      if (Math.min(Math.abs(idx - c.overIdx), n - Math.abs(idx - c.overIdx)) <= this.crossingSpan) return 1;
      if (Math.min(Math.abs(idx - c.underIdx), n - Math.abs(idx - c.underIdx)) <= this.crossingSpan) return 0;
    }
    return -1;
  }

  /** True when the two racers are on different bridge levels (no contact). */
  private separatedByBridge(a: RacerEntry, b: RacerEntry): boolean {
    if (!this.crossings.length) return false;
    return (this.levelAtIdx(a.tracker.idx) === 1) !== (this.levelAtIdx(b.tracker.idx) === 1);
  }

  /** Redraw the "over" section of each crossing as an elevated bridge deck. */
  private drawBridges(): void {
    const pts = this.path.pts;
    const n = pts.length;
    const w = this.track.roadWidth;
    for (const c of this.crossings) {
      const seg: { x: number; y: number }[] = [];
      for (let k = -this.crossingSpan; k <= this.crossingSpan; k++) seg.push(pts[(c.overIdx + k + n) % n]);
      // Ground shadow under the deck.
      const shadow = this.add.graphics().setDepth(10.5);
      shadow.lineStyle(w + 30, 0x000000, 0.35);
      this.strokePolyline(
        shadow,
        seg.map((p) => ({ x: p.x + 7, y: p.y + 9 })),
      );
      // Deck + neon rails above car depth (cars beneath drive under it).
      const deck = this.add.graphics().setDepth(11);
      deck.lineStyle(w + 14, 0x05050d, 1);
      this.strokePolyline(deck, seg);
      deck.lineStyle(w, 0x1a1a26, 1);
      this.strokePolyline(deck, seg);
      deck.lineStyle(4, 0xe8e8ec, 0.5);
      this.strokePolyline(deck, seg);
      const rails = this.add.graphics().setDepth(11.2);
      for (const side of [-1, 1]) {
        const rail = seg.map((p, i) => {
          const j = Math.min(seg.length - 2, i);
          const t = Math.atan2(seg[j + 1].y - seg[j].y, seg[j + 1].x - seg[j].x);
          return { x: p.x + Math.cos(t + Math.PI / 2) * (w / 2 + 6) * side, y: p.y + Math.sin(t + Math.PI / 2) * (w / 2 + 6) * side };
        });
        rails.lineStyle(5, 0xff3b9e, 0.95);
        this.strokePolyline(rails, rail);
      }
    }
  }

  // ---------- Race flow ----------

  private runCountdown(): void {
    const show = (txt: string, color: string, final: boolean): void => {
      const t = this.add
        .text(this.player.car.x, this.player.car.y - 120, txt, {
          fontFamily: 'Impact, "Arial Black", sans-serif',
          fontSize: '96px',
          color,
          stroke: '#000',
          strokeThickness: 8,
        })
        .setOrigin(0.5)
        .setDepth(40);
      this.tweens.add({
        targets: t,
        scale: { from: 1.6, to: final ? 2.2 : 1 },
        alpha: { from: 1, to: 0 },
        duration: final ? 700 : 850,
        ease: 'Cubic.out',
        onComplete: () => t.destroy(),
      });
    };

    const tick = (): void => {
      this.countdownStep++;
      if (this.countdownStep <= 3) {
        show(String(4 - this.countdownStep), hexToCss(PALETTE.amber), false);
        sfx.lowFuel();
        this.time.delayedCall(900, tick);
      } else {
        show('GO!', hexToCss(PALETTE.lime), true);
        sfx.powerup();
        this.phase = 'racing';
        this.raceStart = this.time.now;
      }
    };
    this.time.delayedCall(600, tick);
  }

  /** Abandon the race (ESC / HUD exit button); counts as DNF. */
  quitRace(): void {
    this.finishRace(true);
  }

  private finishRace(quit = false): void {
    if (this.phase === 'done') return;
    this.phase = 'done';
    const position = quit || !this.player.finished ? (this.player.car.fuel <= 0 || quit ? 0 : this.position(this.player)) : this.position(this.player);
    const finalPos = this.player.finished ? this.position(this.player) : position;
    const rewards = raceRewards(this.player.finished ? finalPos : 0, this.racers.length, this.track.rewardMult);
    const timeMs = (this.player.finished ? this.player.finishTime : this.time.now) - this.raceStart;

    const finished = this.player.finished;
    const playerName = 'NitroDriver';
    this.time.delayedCall(finished ? 1600 : 900, () => {
      this.scene.stop('racehud');
      this.scene.start('results', {
        race: {
          position: finished ? finalPos : 0,
          totalCars: this.racers.length,
          laps: Math.min(this.lapsTotal, this.player.tracker.lap),
          lapsTotal: this.lapsTotal,
          timeMs,
          pickups: this.pickupsCollected,
          trackId: this.track.id,
          trackName: this.track.name,
          rewards,
          boostMs: this.player.car.boostMs,
          // Ghost challenge: our recording (for sharing) + the rival ghost (for rematch).
          recording: finished ? this.recorder.toData(playerName, this.track.id, timeMs) : undefined,
          ghost: this.ghostData,
          ghostBeaten: this.ghostData && finished ? timeMs < this.ghostData.timeMs : undefined,
        },
      });
    });
  }

  /** Current 1-based position of a racer (finished racers keep their slot). */
  position(entry: RacerEntry): number {
    const order = [...this.racers].sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      return b.tracker.progress - a.tracker.progress;
    });
    return order.indexOf(entry) + 1;
  }

  // ---------- Main loop ----------

  update(time: number, delta: number): void {
    const dt = Math.min(delta, 50) / 1000;
    const racing = this.phase === 'racing';

    for (const entry of this.racers) {
      const car = entry.car;
      if (!car.alive) continue;

      // Remote players: follow the network, skip local physics entirely.
      if (entry.netId) {
        this.updateRemote(entry, dt, racing);
        continue;
      }

      // Rubber-band bots toward the player's progress.
      if (entry.driver instanceof RaceBotDriver && this.player) {
        const gap = (this.player.tracker.progress - entry.tracker.progress) / this.path.total;
        entry.driver.rubberBand = Phaser.Math.Clamp(gap * 2, -1, 1);
      }

      const input = racing || this.phase === 'done' ? entry.driver.getInput(dt) : { steer: 0, throttle: 0, boost: false };
      const wasBoosting = car.boosting;
      car.update(dt, input);
      if (car.boosting && !wasBoosting && entry === this.player) sfx.boost();

      // Buildings and roadside props are solid — crash and bounce.
      // Airborne cars sail clean over everything on the ground.
      if (car.airTimer <= 0) this.collideScenery(car, time, entry === this.player);

      // Lap/progress tracking.
      if (racing) {
        const lapped = entry.tracker.update(car.x, car.y);
        if (lapped && entry.tracker.lap >= this.lapsTotal && !entry.finished) {
          entry.finished = true;
          entry.finishTime = this.time.now;
          this.finishedCount++;
          if (entry === this.player) {
            sfx.levelUp();
            this.finishRace();
          }
        } else if (lapped && entry === this.player) {
          sfx.reward();
          this.events.emit('lap', entry.tracker.lap);
        }
      }

      // Off-road: heavy slowdown outside the asphalt — unless the car is
      // threading a shortcut or flying off a ramp.
      const centerDist = entry.tracker.distToCenter(car.x, car.y);
      const onRoad =
        centerDist < this.track.roadWidth / 2 + 14 ||
        car.airTimer > 0 ||
        (this.shortcutLines.length > 0 && this.distToShortcut(car.x, car.y) < this.shortcutHalf + 8);
      if (!onRoad) {
        car.slowTimer = Math.max(car.slowTimer, 0.15);
        if (entry === this.player && !this.offRoad) sfx.bump();
      }
      if (entry === this.player) this.offRoad = !onRoad;

      // Boost pads and jump ramps (grounded cars only).
      if (car.airTimer <= 0 && racing) {
        for (const pad of this.pads) {
          const pdx = pad.x - car.x;
          const pdy = pad.y - car.y;
          if (pdx * pdx + pdy * pdy > 50 * 50) continue;
          if (car.overdriveTimer <= 0) {
            this.burstAt(pad.x, pad.y, 10, 0x19c8ff);
            if (entry === this.player) sfx.powerup();
          }
          car.applyOverdrive(1.4);
        }
        for (const ramp of this.ramps) {
          const rdx = ramp.x - car.x;
          const rdy = ramp.y - car.y;
          if (rdx * rdx + rdy * rdy > 46 * 46) continue;
          const along = Math.cos(car.heading - ramp.angle);
          if (along < 0.5 || Math.abs(car.speed) < 170 || car.spinTimer > 0) continue;
          car.launch(0.38 + Math.abs(car.speed) / 1400);
          if (entry === this.player) {
            sfx.boost();
            this.cameras.main.shake(80, 0.003);
          }
        }
      }

      // World bounds safety.
      car.x = Phaser.Math.Clamp(car.x, 30, this.track.size - 30);
      car.y = Phaser.Math.Clamp(car.y, 30, this.track.size - 30);

      // Pickups (not while airborne — you fly right over them).
      for (const pickup of this.pickups) {
        if (!pickup.active || car.airTimer > 0) continue;
        const dx = pickup.x - car.x;
        const dy = pickup.y - car.y;
        if (dx * dx + dy * dy > 44 * 44) continue;
        pickup.active = false;
        pickup.respawnAt = time + (pickup.kind === 'barrel' ? 12_000 : 8000);
        pickup.sprite.setVisible(false);
        if (pickup.kind === 'fuel') {
          car.fuel = Math.min(car.stats.tank, car.fuel + 22);
          if (entry === this.player) {
            this.pickupsCollected++;
            sfx.scrapPickup();
          }
        } else if (pickup.kind === 'ammo') {
          entry.ammo = Math.min(3, entry.ammo + 1);
          if (entry === this.player) {
            this.pickupsCollected++;
            sfx.scrapPickup();
          }
        } else {
          car.applyOverdrive(3);
          car.fuel = Math.min(car.stats.tank, car.fuel + 8);
          this.burstAt(pickup.x, pickup.y, 16, PALETTE.gold);
          if (entry === this.player) {
            this.pickupsCollected++;
            sfx.powerup();
          }
        }
      }

      // Hazards (airborne cars clear them).
      for (const h of this.hazards) {
        if (car.airTimer > 0) break;
        const dx = h.x - car.x;
        const dy = h.y - car.y;
        const rr = (h.r + CAR_RADIUS * 0.6) * (h.r + CAR_RADIUS * 0.6);
        if (dx * dx + dy * dy > rr) continue;
        if (h.kind === 'oil' && car.spinTimer <= 0 && Math.abs(car.speed) > 60) {
          car.spinOut();
          if (entry === this.player) sfx.spin();
        } else if (h.kind === 'cone' && car.slowTimer <= 0.1) {
          car.slowTimer = 0.5;
          const knockAngle = Math.atan2(-dy, -dx) + (Math.random() - 0.5) * 0.8;
          h.x += Math.cos(knockAngle) * 70;
          h.y += Math.sin(knockAngle) * 70;
          this.tweens.add({ targets: h.sprite, x: h.x, y: h.y, angle: h.sprite.angle + 200, duration: 250, ease: 'Cubic.out' });
          if (entry === this.player) sfx.bump();
        } else if (h.kind === 'pothole' && car.slowTimer <= 0.1) {
          car.slowTimer = 0.8;
          if (entry === this.player) {
            sfx.bump();
            this.cameras.main.shake(110, 0.004);
          }
        }
      }

      // Bombs: driving close lights the short fuse (not from mid-air).
      for (const bomb of this.bombs) {
        if (!bomb.active || bomb.explodeAt > 0 || car.airTimer > 0) continue;
        const bdx = bomb.x - car.x;
        const bdy = bomb.y - car.y;
        if (bdx * bdx + bdy * bdy > 52 * 52) continue;
        bomb.explodeAt = time + 650;
        bomb.sprite.setTint(0xff6040);
        this.tweens.add({ targets: bomb.sprite, scale: { from: 1, to: 1.3 }, yoyo: true, repeat: 3, duration: 80 });
        if (entry === this.player) sfx.lowFuel();
      }

      // Bots with ammo take a shot when a rival lines up ahead.
      if (this.shootingOn && racing && entry !== this.player && !entry.netId && entry.ammo > 0 && time - entry.lastFireAt > 2500) {
        for (const other of this.racers) {
          if (other === entry) continue;
          const odx = other.car.x - car.x;
          const ody = other.car.y - car.y;
          const dist = Math.hypot(odx, ody);
          if (dist > 560 || dist < 60) continue;
          let aim = Math.atan2(ody, odx) - car.heading;
          while (aim > Math.PI) aim -= Math.PI * 2;
          while (aim < -Math.PI) aim += Math.PI * 2;
          if (Math.abs(aim) < 0.28) {
            this.fireFrom(entry, time);
            break;
          }
        }
      }

      // Out of fuel and stopped: player DNFs.
      if (entry === this.player && racing && car.fuel <= 0 && Math.abs(car.speed) < 8) {
        this.finishRace();
      }
    }

    // Player fire input (F key or touch button).
    if (this.shootingOn && racing && (this.fireQueued || touchControls.firePressed)) {
      this.fireFrom(this.player, time);
    }
    this.fireQueued = false;
    touchControls.firePressed = false;

    this.updateFireballs(dt, time);
    this.updateBombs(time);

    // Pickup respawns.
    for (const pickup of this.pickups) {
      if (!pickup.active && time >= pickup.respawnAt) this.spawnPickup(pickup.kind, pickup);
    }

    // Car-vs-car bumps. Remote cars are immovable here — their true
    // position lives on their owner's device; only the local car yields.
    for (let i = 0; i < this.racers.length; i++) {
      const aRemote = !!this.racers[i].netId;
      const a = this.racers[i].car;
      for (let j = i + 1; j < this.racers.length; j++) {
        const bRemote = !!this.racers[j].netId;
        if (aRemote && bRemote) continue;
        // No contact across bridge levels or with an airborne car.
        if (this.separatedByBridge(this.racers[i], this.racers[j])) continue;
        const b = this.racers[j].car;
        if (a.airTimer > 0 || b.airTimer > 0) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const minD = CAR_RADIUS * 2;
        if (d2 < minD * minD && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = (minD - d) / 2;
          const nx = dx / d;
          const ny = dy / d;
          if (aRemote) {
            b.x += nx * push * 2;
            b.y += ny * push * 2;
            b.speed *= 0.94;
          } else if (bRemote) {
            a.x -= nx * push * 2;
            a.y -= ny * push * 2;
            a.speed *= 0.94;
          } else {
            // Ramming: a hard enough shunt sends the victim into a spin.
            const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
            if (rel > 260 && b.spinTimer <= 0) {
              b.spinOut();
              b.speed *= 0.7;
              sfx.spin();
            } else if (rel < -260 && a.spinTimer <= 0) {
              a.spinOut();
              a.speed *= 0.7;
              sfx.spin();
            }
            a.x -= nx * push;
            a.y -= ny * push;
            b.x += nx * push;
            b.y += ny * push;
            a.speed *= 0.94;
            b.speed *= 0.94;
          }
        }
      }
    }

    // Views + engine.
    for (const entry of this.racers) {
      const car = entry.car;
      entry.view.container.setPosition(car.x, car.y);
      entry.view.sprite.setRotation(car.heading);
      // Ramp jumps: the car swells along a sine arc while its shadow stays
      // grounded and slides away — reads as height in pure top-down.
      const hop = car.airTimer > 0 && car.airTotal > 0 ? Math.sin(Math.min(1, 1 - car.airTimer / car.airTotal) * Math.PI) : 0;
      entry.view.sprite.setScale(CAR_SCALE * (car.boosting || car.overdriveTimer > 0 ? 1.08 : 1) * (1 + hop * 0.42));
      if (hop > 0) {
        entry.view.shadow
          .setVisible(true)
          .setAlpha(0.3)
          .setRotation(car.heading)
          .setScale(CAR_SCALE * (1 - hop * 0.12))
          .setPosition(hop * 16, hop * 24);
      } else if (entry.view.shadow.visible) {
        entry.view.shadow.setVisible(false).setPosition(0, 0);
      }
      // Bridge decks render above ground cars; whoever is on the deck (or
      // mid-jump) must render above the deck in turn.
      const elevated = car.airTimer > 0 || (this.crossings.length > 0 && this.levelAtIdx(entry.tracker.idx) === 1);
      entry.view.container.setDepth(elevated ? 11.5 : 10);
      entry.view.flames.update(car, 44 * CAR_SCALE);
    }
    const pc = this.player.car;
    sfx.setEngine(Phaser.Math.Clamp(Math.abs(pc.speed) / pc.stats.topSpeed, 0, 1), pc.boosting || pc.overdriveTimer > 0);

    // Live multiplayer: share our position ~15×/s (also after finishing,
    // so rivals receive the final time).
    if (this.net && this.phase !== 'countdown' && time - this.lastNetSend > 66) {
      this.lastNetSend = time;
      this.net.room.sendState({
        t: 'state',
        id: this.net.room.myId,
        x: Math.round(pc.x),
        y: Math.round(pc.y),
        h: pc.heading,
        lap: this.player.tracker.lap,
        prog: Math.round(this.player.tracker.progress),
        boost: pc.boosting || pc.overdriveTimer > 0,
        fin: this.player.finished ? Math.round(this.player.finishTime - this.raceStart) : 0,
      });
    }

    this.updateBlackout(dt);

    // Ghost racing: record our run, replay the challenger's.
    if (racing) {
      this.recorder.record(this.raceTimeMs, pc.x, pc.y, pc.heading);
    }
    if (this.ghostSprite && this.ghostPlayer && this.phase !== 'countdown') {
      const g = this.ghostPlayer.at(this.raceTimeMs);
      this.ghostSprite.setPosition(g.x, g.y);
      (this.ghostSprite.list[0] as Phaser.GameObjects.Image).setRotation(g.heading);
    }
  }

  // ---------- Weapons & bombs ----------

  /** Fireball ammo count shown in the HUD. */
  get playerAmmo(): number {
    return this.player?.ammo ?? 0;
  }

  private fireFrom(entry: RacerEntry, time: number): void {
    if (entry.ammo <= 0 || time - entry.lastFireAt < 450) return;
    entry.ammo--;
    entry.lastFireAt = time;
    const car = entry.car;
    const speed = Math.max(0, car.speed) + 560;
    const sprite = this.add
      .image(car.x, car.y, 'orb')
      .setTint(0xff8a1f)
      .setScale(1.25)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(12);
    this.fireballs.push({
      x: car.x + Math.cos(car.heading) * 34,
      y: car.y + Math.sin(car.heading) * 34,
      vx: Math.cos(car.heading) * speed,
      vy: Math.sin(car.heading) * speed,
      ownerId: car.id,
      onBridge: this.crossings.length > 0 && this.levelAtIdx(entry.tracker.idx) === 1,
      sprite,
      expiresAt: time + 1300,
    });
    if (entry === this.player) sfx.boost();
  }

  private updateFireballs(dt: number, time: number): void {
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const fb = this.fireballs[i];
      fb.x += fb.vx * dt;
      fb.y += fb.vy * dt;
      fb.sprite.setPosition(fb.x, fb.y);

      let hit = false;
      // Hit a rival: fiery blast + spin pirouette, then they carry on.
      // Shots stay on their own bridge level and sail under jumping cars.
      for (const entry of this.racers) {
        const car = entry.car;
        if (car.id === fb.ownerId || entry.netId || car.airTimer > 0) continue;
        if (this.crossings.length > 0 && (this.levelAtIdx(entry.tracker.idx) === 1) !== fb.onBridge) continue;
        const dx = car.x - fb.x;
        const dy = car.y - fb.y;
        if (dx * dx + dy * dy > 30 * 30) continue;
        hit = true;
        this.burstAt(fb.x, fb.y, 22, 0xff8a1f);
        this.burstAt(fb.x, fb.y, 10, 0xff3b18);
        sfx.explosion();
        if (car.spinTimer <= 0) car.spinOut();
        car.speed *= 0.55;
        if (entry === this.player) this.cameras.main.shake(220, 0.008);
        break;
      }
      // Solid scenery stops fireballs.
      if (!hit) {
        for (const p of this.props) {
          const dx = p.x - fb.x;
          const dy = p.y - fb.y;
          if (dx * dx + dy * dy < p.r * p.r) {
            hit = true;
            this.burstAt(fb.x, fb.y, 10, 0xff8a1f);
            break;
          }
        }
      }
      if (hit || time > fb.expiresAt) {
        fb.sprite.destroy();
        this.fireballs.splice(i, 1);
      }
    }
  }

  private updateBombs(time: number): void {
    for (const bomb of this.bombs) {
      if (!bomb.active) {
        if (time >= bomb.respawnAt) this.spawnBomb(bomb);
        continue;
      }
      if (bomb.explodeAt > 0 && time >= bomb.explodeAt) {
        bomb.active = false;
        bomb.respawnAt = time + 9000;
        bomb.sprite.setVisible(false);
        bomb.ember.setVisible(false);
        this.burstAt(bomb.x, bomb.y, 30, 0xffb020);
        this.burstAt(bomb.x, bomb.y, 16, 0xff3b18);
        sfx.explosion();
        // Blast wave: spin and slow anyone nearby (jumpers clear it).
        for (const entry of this.racers) {
          if (entry.netId || entry.car.airTimer > 0) continue;
          const car = entry.car;
          const dx = car.x - bomb.x;
          const dy = car.y - bomb.y;
          if (dx * dx + dy * dy > 110 * 110) continue;
          if (car.spinTimer <= 0) car.spinOut();
          car.speed *= 0.4;
          if (entry === this.player) this.cameras.main.shake(280, 0.01);
        }
      }
    }
  }

  // ---------- Wasteland blackouts ----------

  /**
   * Seeded blackout schedule (identical for all multiplayer clients),
   * a full-screen darkness layer with headlight erases, and a neon
   * outline of the road edges that only shows in the dark.
   */
  private setupBlackouts(): void {
    let t = 7000 + this.rand() * 7000;
    for (let i = 0; i < 14; i++) {
      const duration = 3500 + this.rand() * 3500;
      this.blackoutWindows.push({ start: t, end: t + duration });
      t += duration + 8000 + this.rand() * 10000;
    }

    // Road-edge outline, hidden until the lights go out.
    const g = this.add.graphics().setDepth(56).setAlpha(0);
    g.lineStyle(3, 0xff2ec4, 0.95);
    const pts = this.path.pts;
    const n = pts.length;
    const half = this.track.roadWidth / 2 + 4;
    for (const side of [-1, 1]) {
      g.beginPath();
      for (let i = 0; i <= n; i += 2) {
        const p = pts[i % n];
        const q = pts[(i + 2) % n];
        const perp = Math.atan2(q.y - p.y, q.x - p.x) + Math.PI / 2;
        const x = p.x + Math.cos(perp) * half * side;
        const y = p.y + Math.sin(perp) * half * side;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.strokePath();
    }
    this.outlineGfx = g;

    // Darkness overlay sized to the camera's visible world rect (zoom-aware).
    const zoom = this.cameras.main.zoom;
    const w = Math.ceil(this.scale.width / zoom);
    const h = Math.ceil(this.scale.height / zoom);
    this.darkness = this.add.renderTexture(0, 0, w, h);
    this.darkness
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(50)
      .setPosition((this.scale.width - w) / 2, (this.scale.height - h) / 2)
      .setVisible(false);
  }

  private updateBlackout(dt: number): void {
    if (!this.darkness || this.phase === 'countdown') return;
    const raceTime = this.raceTimeMs;
    const inWindow = this.blackoutWindows.some((w) => raceTime >= w.start && raceTime < w.end);

    if (inWindow && !this.blackoutActive) {
      this.blackoutActive = true;
      sfx.lowFuel();
      this.events.emit('blackout');
    } else if (!inWindow && this.blackoutActive) {
      this.blackoutActive = false;
    }

    // Fade the dark in fast, out a little slower.
    const target = inWindow ? 1 : 0;
    const rate = inWindow ? dt / 0.5 : dt / 0.8;
    this.blackoutAlpha = Phaser.Math.Clamp(this.blackoutAlpha + (target > this.blackoutAlpha ? rate : -rate), 0, 1);

    const dark = this.blackoutAlpha > 0.01;
    this.darkness.setVisible(dark);
    this.outlineGfx?.setAlpha(this.blackoutAlpha);
    // Exhaust flames glow above the darkness while it's active.
    for (const entry of this.racers) entry.view.flames.setDepth(dark ? 55 : 9);
    if (this.ghostSprite) this.ghostSprite.setAlpha(dark ? 0.12 : 1);
    if (!dark) return;

    // Redraw: pitch black, erased by headlight cones and small pools.
    const rt = this.darkness;
    const cam = this.cameras.main;
    rt.clear();
    rt.fill(0x000004, 0.985 * this.blackoutAlpha);
    for (const entry of this.racers) {
      const car = entry.car;
      const sx = car.x - cam.worldView.x;
      const sy = car.y - cam.worldView.y;
      if (sx < -300 || sy < -300 || sx > rt.width + 300 || sy > rt.height + 300) continue;
      const isPlayer = entry === this.player;
      const pool = this.make.image({ x: sx, y: sy, key: 'glow', add: false }).setScale(isPlayer ? 1.4 : 0.8);
      rt.erase(pool, sx, sy);
      pool.destroy();
      const light = this.make
        .image({ x: sx, y: sy, key: 'headlight', add: false })
        .setOrigin(0.09, 0.5)
        .setRotation(car.heading)
        .setScale(isPlayer ? 1.5 : 0.8);
      rt.erase(light, sx, sy);
      light.destroy();
    }
  }

  /** Smoothly track a network rival toward its latest reported state. */
  private updateRemote(entry: RacerEntry, dt: number, racing: boolean): void {
    const msg = this.remoteTargets.get(entry.netId!);
    const car = entry.car;
    if (msg) {
      const k = Math.min(1, dt * 10);
      car.x += (msg.x - car.x) * k;
      car.y += (msg.y - car.y) * k;
      let dh = msg.h - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      car.heading += dh * k;
      car.boosting = msg.boost;
      if (msg.fin > 0 && !entry.finished) {
        entry.finished = true;
        entry.finishTime = this.raceStart + msg.fin;
      }
    }
    if (racing && !entry.finished) entry.tracker.update(car.x, car.y);
  }

  get raceTimeMs(): number {
    return this.phase === 'countdown' ? 0 : this.time.now - this.raceStart;
  }

  private burstAt(x: number, y: number, count: number, tint: number): void {
    const emitter = this.add.particles(x, y, 'dot', {
      speed: { min: 60, max: 240 },
      scale: { start: 1.4, end: 0 },
      lifespan: 500,
      quantity: count,
      tint,
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    emitter.setDepth(20);
    emitter.explode(count);
    this.time.delayedCall(700, () => emitter.destroy());
  }
}
