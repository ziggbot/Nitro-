import Phaser from 'phaser';
import { trackById, type TrackDef } from '../config/tracks';
import { CAR_CLASSES, effectiveStats } from '../config/cars';
import { ENV_PALETTES, PALETTE, hexToCss } from '../config/palette';
import type { Driver } from '../core/types';
import { botNames } from '../ai/names';
import { RaceBotDriver } from '../ai/RaceBotDriver';
import { CarSim } from '../game/CarSim';
import { PlayerDriver } from '../game/PlayerDriver';
import { buildPath, LapTracker, type RacePath } from '../game/racePath';
import { sfx } from '../game/sfx';
import { music } from '../game/music';
import { loadSave, type SaveData } from '../meta/SaveGame';
import { raceRewards } from '../meta/Progression';
import { ExhaustFx } from '../game/exhaust';
import { fuelById, randomFuel } from '../config/fuels';
import { GhostPlayer, GhostRecorder, type GhostData } from '../game/ghost';
import type { NetRoom, NetPlayer, StateMsg } from '../net/room';

interface RacerView {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
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
  /** Multiplayer: remote player's peer id (position comes from the net). */
  netId?: string;
}

interface NetworkData {
  room: NetRoom;
  players: NetPlayer[];
}

const idleDriver: Driver = { name: 'remote', isPlayer: false, getInput: () => ({ steer: 0, throttle: 0, boost: false }) };

interface TrackPickup {
  kind: 'fuel' | 'barrel';
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Image;
  active: boolean;
  respawnAt: number;
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
  }

  create(): void {
    const size = this.track.size;

    if (this.track.daylight) {
      this.add.tileSprite(size / 2, size / 2, size, size, `floor-${this.track.envId}-day`);
    } else {
      this.add.tileSprite(size / 2, size / 2, size, size, `floor-${this.track.envId}`).setAlpha(0.55);
    }
    this.drawScenery();
    this.drawTrack();
    this.spawnTrackside();

    // Grid: two columns behind the start line, facing along the track.
    const startIdx = 0;
    const n = this.path.pts.length;
    const startPt = this.path.pts[startIdx];
    const nextPt = this.path.pts[4 % n];
    const startAngle = Math.atan2(nextPt.y - startPt.y, nextPt.x - startPt.x);
    const backX = -Math.cos(startAngle);
    const backY = -Math.sin(startAngle);
    const sideX = Math.cos(startAngle + Math.PI / 2);
    const sideY = Math.sin(startAngle + Math.PI / 2);

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
      const gx = startPt.x + backX * (60 + row * 70) + sideX * col * 42;
      const gy = startPt.y + backY * (60 + row * 70) + sideY * col * 42;

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
      car.spawnAt(gx, gy, startAngle);

      const sprite = this.add.image(0, 0, fuel.texture).setScale(CAR_SCALE).setTint(fuel.color);
      const label = this.add
        .text(0, -46, spec.kind === 'player' ? 'YOU' : spec.name, {
          fontFamily: '"Segoe UI", Arial, sans-serif',
          fontSize: '13px',
          color: spec.kind === 'player' ? '#ffffff' : spec.kind === 'remote' ? '#ffe9a8' : '#a9c1e8',
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(0.5);
      const container = this.add.container(gx, gy, [sprite, label]).setDepth(10);
      const flames = new ExhaustFx(this, car, fuel);

      const entry: RacerEntry = {
        car,
        driver,
        tracker: new LapTracker(this.path, startIdx),
        view: { container, sprite, label, flames },
        finished: false,
        finishTime: 0,
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

    this.scene.launch('racehud', { track: this.track, path: this.path });
    sfx.startEngine(this.save.selectedFuel);
    music.start();
    this.input.once('pointerdown', () => music.start());

    this.runCountdown();

    this.input.keyboard!.on('keydown-ESC', () => this.quitRace());
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

    // Daylight city: bright asphalt with gold curbs. Daylight forest:
    // packed-dirt rally road with earth shoulders. Night: neon circuit.
    const forest = this.track.envId === 'forest';
    const passes: [number, number, number][] = day
      ? forest
        ? [
            [w + 24, 0x3e4a2c, 1], // grass-shadow shoulder
            [w + 10, 0x8a6a3c, 0.8], // earth berm
            [w, 0x74603e, 1], // packed dirt
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
    // Center line dashes — white on asphalt, tire ruts on dirt, violet at night.
    g.lineStyle(day ? 5 : 4, day ? (forest ? 0x5c4a30 : 0xe8e8ec) : 0x3a3a5c, 0.9);
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
    if (!this.track.daylight) return;
    if (this.track.envId === 'forest') {
      this.drawForestScenery();
      return;
    }
    const size = this.track.size;
    const roadHalf = this.track.roadWidth / 2;
    const pts = this.path.pts;

    const minDistToRoad = (x: number, y: number): number => {
      let best = Infinity;
      for (let i = 0; i < pts.length; i += 2) {
        const dx = pts[i].x - x;
        const dy = pts[i].y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < best) best = d2;
      }
      return Math.sqrt(best);
    };
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
    const minDistToRoad = (x: number, y: number): number => {
      let best = Infinity;
      for (let i = 0; i < pts.length; i += 2) {
        const dx = pts[i].x - x;
        const dy = pts[i].y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < best) best = d2;
      }
      return Math.sqrt(best);
    };

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

  private spawnPickup(kind: 'fuel' | 'barrel', existing?: TrackPickup): void {
    const pos = this.pointOnTrack(20);
    if (existing) {
      existing.x = pos.x;
      existing.y = pos.y;
      existing.active = true;
      existing.sprite.setPosition(pos.x, pos.y).setVisible(true);
      return;
    }
    const sprite = this.add.image(pos.x, pos.y, kind === 'fuel' ? 'pickup-fuel' : 'pickup-barrel').setDepth(4);
    if (kind === 'barrel') {
      this.tweens.add({ targets: sprite, scale: { from: 1, to: 1.15 }, yoyo: true, repeat: -1, duration: 550, ease: 'Sine.inOut' });
    }
    this.pickups.push({ kind, x: pos.x, y: pos.y, sprite, active: true, respawnAt: 0 });
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
      this.collideScenery(car, time, entry === this.player);

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

      // Off-road: heavy slowdown outside the asphalt.
      const centerDist = entry.tracker.distToCenter(car.x, car.y);
      const onRoad = centerDist < this.track.roadWidth / 2 + 14;
      if (!onRoad) {
        car.slowTimer = Math.max(car.slowTimer, 0.15);
        if (entry === this.player && !this.offRoad) sfx.bump();
      }
      if (entry === this.player) this.offRoad = !onRoad;

      // World bounds safety.
      car.x = Phaser.Math.Clamp(car.x, 30, this.track.size - 30);
      car.y = Phaser.Math.Clamp(car.y, 30, this.track.size - 30);

      // Pickups.
      for (const pickup of this.pickups) {
        if (!pickup.active) continue;
        const dx = pickup.x - car.x;
        const dy = pickup.y - car.y;
        if (dx * dx + dy * dy > 36 * 36) continue;
        pickup.active = false;
        pickup.respawnAt = time + (pickup.kind === 'barrel' ? 12_000 : 8000);
        pickup.sprite.setVisible(false);
        if (pickup.kind === 'fuel') {
          car.fuel = Math.min(car.stats.tank, car.fuel + 22);
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

      // Hazards.
      for (const h of this.hazards) {
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

      // Out of fuel and stopped: player DNFs.
      if (entry === this.player && racing && car.fuel <= 0 && Math.abs(car.speed) < 8) {
        this.finishRace();
      }
    }

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
        const b = this.racers[j].car;
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
      entry.view.sprite.setScale(CAR_SCALE * (car.boosting || car.overdriveTimer > 0 ? 1.08 : 1));
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
