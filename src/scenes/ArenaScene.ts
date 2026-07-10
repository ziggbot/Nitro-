import Phaser from 'phaser';
import { arenaById, type ArenaDef } from '../config/arenas';
import { CAR_CLASSES, effectiveStats } from '../config/cars';
import { PAINTS, TRAIL_STYLES } from '../config/cosmetics';
import { ENV_PALETTES, PALETTE } from '../config/palette';
import type { CauseOfDeath, Driver, RunResult } from '../core/types';
import { BotDriver, randomPersonality, type BotWorld } from '../ai/BotDriver';
import { botNames } from '../ai/names';
import { CarSim, MIN_TRAIL, TRAIL_SPACING } from '../game/CarSim';
import { PlayerDriver } from '../game/PlayerDriver';
import { SpatialGrid, type GridPoint } from '../game/SpatialGrid';
import { sfx } from '../game/sfx';
import { loadSave, type SaveData } from '../meta/SaveGame';
import { applyRewards } from '../meta/Progression';

interface CarView {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
}

interface ScrapOrb {
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Image;
  expiresAt: number;
}

interface Hazard {
  kind: 'oil' | 'cone' | 'pothole';
  x: number;
  y: number;
  r: number;
  sprite: Phaser.GameObjects.Image;
}

const WALL_MARGIN = 24;
const CAR_RADIUS = 16;
const ORB_EAT_RADIUS = 26;
const TRAIL_HIT_RADIUS = 15;

export class ArenaScene extends Phaser.Scene {
  private arena!: ArenaDef;
  private save!: SaveData;

  cars: CarSim[] = [];
  private views = new Map<number, CarView>();
  private drivers = new Map<number, Driver>();
  private botRespawns: { at: number; carId: number }[] = [];

  player!: CarSim;
  private playerDriver!: PlayerDriver;
  private playerDead = false;
  private runStart = 0;
  private bestRank = 99;

  private orbGrid = new SpatialGrid(96);
  private orbPoints: GridPoint[] = [];
  private orbSprites: Phaser.GameObjects.Image[] = [];
  private scraps: ScrapOrb[] = [];
  trailGrid = new SpatialGrid(64);
  hazards: Hazard[] = [];

  private trailGfx!: Phaser.GameObjects.Graphics;
  private darkness?: Phaser.GameObjects.RenderTexture;
  private nextCarId = 1;
  private lowFuelWarned = false;

  constructor() {
    super('arena');
  }

  init(data: { arenaId?: string }): void {
    this.save = loadSave();
    this.arena = arenaById(data.arenaId ?? this.save.selectedArena);
    // Reset per-run state (scenes are reused across runs).
    this.cars = [];
    this.views.clear();
    this.drivers.clear();
    this.botRespawns = [];
    this.orbPoints = [];
    this.orbSprites = [];
    this.scraps = [];
    this.hazards = [];
    this.orbGrid.clear();
    this.trailGrid.clear();
    this.playerDead = false;
    this.bestRank = 99;
    this.nextCarId = 1;
    this.lowFuelWarned = false;
  }

  create(): void {
    const size = this.arena.size;
    const pal = ENV_PALETTES[this.arena.envId];

    this.add.tileSprite(size / 2, size / 2, size, size, `floor-${this.arena.envId}`);

    // Arena walls with neon glow.
    const walls = this.add.graphics();
    walls.lineStyle(14, pal.wall, 0.22).strokeRect(WALL_MARGIN, WALL_MARGIN, size - WALL_MARGIN * 2, size - WALL_MARGIN * 2);
    walls.lineStyle(4, pal.wall, 0.95).strokeRect(WALL_MARGIN, WALL_MARGIN, size - WALL_MARGIN * 2, size - WALL_MARGIN * 2);

    this.trailGfx = this.add.graphics();

    this.spawnHazards();
    for (let i = 0; i < this.arena.orbCount; i++) this.spawnOrb(i);

    // Player car with saved cosmetics + garage upgrades.
    const classDef = CAR_CLASSES.find((c) => c.id === this.save.selectedCar) ?? CAR_CLASSES[0];
    const paint = PAINTS.find((p) => p.id === this.save.selectedPaint) ?? PAINTS[0];
    const trailStyle = TRAIL_STYLES.find((t) => t.id === this.save.selectedTrail) ?? TRAIL_STYLES[0];
    this.playerDriver = new PlayerDriver(this, 'YOU');
    this.player = this.addCar(
      this.playerDriver,
      effectiveStats(classDef.id, this.save.upgrades[classDef.id] ?? {}),
      classDef.texture,
      paint.tint,
      trailStyle.colors,
      true,
    );
    this.playerDriver.car = this.player;

    // Bots.
    for (const name of botNames(this.arena.botCount)) this.spawnBot(name);

    // Camera.
    const cam = this.cameras.main;
    cam.setBounds(0, 0, size, size);
    cam.startFollow(this.views.get(this.player.id)!.container, false, 0.08, 0.08);
    this.applyZoom();
    this.scale.on('resize', this.applyZoom, this);
    if (this.renderer.type === Phaser.WEBGL) {
      cam.postFX.addBloom(0xffffff, 1, 1, 1.1, 0.7);
    }

    if (this.arena.night) {
      this.darkness = this.add.renderTexture(0, 0, this.scale.width, this.scale.height);
      this.darkness.setOrigin(0).setScrollFactor(0).setDepth(50);
      this.layoutDarkness();
    }

    this.runStart = this.time.now;
    this.scene.launch('hud', { arena: this.arena });

    this.input.keyboard!.on('keydown-ESC', () => {
      if (!this.playerDead) this.wreck(this.player, 'fuel');
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.applyZoom, this);
    });
  }

  private applyZoom(): void {
    const zoom = Phaser.Math.Clamp(Math.min(this.scale.width, this.scale.height) / 900, 0.55, 1.15);
    this.cameras.main.setZoom(zoom);
    this.layoutDarkness();
  }

  /**
   * Camera zoom also scales scrollFactor-0 objects (around the viewport
   * center), so the darkness RT must be sized to the visible WORLD rect
   * and positioned so the zoom transform stretches it over the screen.
   */
  private layoutDarkness(): void {
    if (!this.darkness) return;
    const zoom = this.cameras.main.zoom;
    const w = Math.ceil(this.scale.width / zoom);
    const h = Math.ceil(this.scale.height / zoom);
    this.darkness.resize(w, h);
    this.darkness.setPosition((this.scale.width - w) / 2, (this.scale.height - h) / 2);
  }

  // ---------- Spawning ----------

  private randomOpenPos(margin = 200): { x: number; y: number } {
    return {
      x: margin + Math.random() * (this.arena.size - margin * 2),
      y: margin + Math.random() * (this.arena.size - margin * 2),
    };
  }

  private addCar(
    driver: Driver,
    stats: ReturnType<typeof effectiveStats>,
    texture: string,
    tint: number,
    trailColors: number[],
    isPlayer: boolean,
  ): CarSim {
    const car = new CarSim(this.nextCarId++, driver, stats, tint, trailColors);
    const pos = this.randomOpenPos(isPlayer ? 600 : 250);
    car.spawnAt(pos.x, pos.y, Math.random() * Math.PI * 2);

    const sprite = this.add.image(0, 0, texture).setScale(0.55).setTint(tint);
    const label = this.add
      .text(0, -30, driver.name, {
        fontFamily: '"Segoe UI", Arial, sans-serif',
        fontSize: '13px',
        color: isPlayer ? '#ffffff' : '#a9c1e8',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    const container = this.add.container(pos.x, pos.y, [sprite, label]).setDepth(10);

    this.cars.push(car);
    this.views.set(car.id, { container, sprite, label });
    this.drivers.set(car.id, driver);
    return car;
  }

  private spawnBot(name: string): void {
    const driver = new BotDriver(name, randomPersonality());
    const classDef = CAR_CLASSES[Math.floor(Math.random() * CAR_CLASSES.length)];
    const paint = PAINTS[Math.floor(Math.random() * PAINTS.length)];
    const style = TRAIL_STYLES[Math.floor(Math.random() * TRAIL_STYLES.length)];
    const car = this.addCar(driver, { ...classDef.base }, classDef.texture, paint.tint, style.colors, false);
    // Bots start with a bit of random progress so the arena feels lived-in.
    car.trailLimit = MIN_TRAIL + Math.floor(Math.random() * 40);
    driver.car = car;
    driver.world = this.botWorld();
  }

  private botWorld(): BotWorld {
    return {
      arenaSize: this.arena.size,
      trailGrid: this.trailGrid,
      orbGrid: this.orbGrid,
      cars: this.cars,
      hazards: this.hazards,
    };
  }

  private spawnOrb(slot: number): void {
    const pos = this.randomOpenPos(80);
    const colorPool = [PALETTE.cyan, PALETTE.magenta, PALETTE.amber, PALETTE.lime, PALETTE.violet];
    const tint = colorPool[Math.floor(Math.random() * colorPool.length)];
    const sprite = this.add.image(pos.x, pos.y, 'orb').setTint(tint).setScale(0.8 + Math.random() * 0.5);
    const point: GridPoint = { x: pos.x, y: pos.y, owner: -1, data: slot };
    if (this.orbSprites[slot]) this.orbSprites[slot].destroy();
    this.orbSprites[slot] = sprite;
    this.orbPoints[slot] = point;
    this.orbGrid.insert(point);
  }

  private respawnOrb(slot: number): void {
    this.orbGrid.remove(this.orbPoints[slot]);
    this.spawnOrb(slot);
  }

  private spawnHazards(): void {
    const defs: { kind: Hazard['kind']; count: number; texture: string; r: number }[] = [
      { kind: 'oil', count: this.arena.hazards.oil, texture: 'oil', r: 34 },
      { kind: 'cone', count: this.arena.hazards.cones, texture: 'cone', r: 14 },
      { kind: 'pothole', count: this.arena.hazards.potholes, texture: 'pothole', r: 20 },
    ];
    for (const def of defs) {
      for (let i = 0; i < def.count; i++) {
        const pos = this.randomOpenPos(150);
        const sprite = this.add.image(pos.x, pos.y, def.texture).setDepth(2);
        if (def.kind === 'oil') sprite.setAlpha(0.9);
        this.hazards.push({ kind: def.kind, x: pos.x, y: pos.y, r: def.r, sprite });
      }
    }
  }

  // ---------- Main loop ----------

  update(time: number, delta: number): void {
    const dt = Math.min(delta, 50) / 1000;

    this.rebuildTrailGrid();

    for (const car of this.cars) {
      if (!car.alive) continue;
      const driver = this.drivers.get(car.id)!;
      const wasBoosting = car.boosting;
      car.update(dt, driver.getInput(dt));
      if (car.boosting && !wasBoosting && car === this.player) sfx.boost();
    }

    this.handleCollisions(time);
    this.handleRespawns(time);
    this.updateRanks();
    this.updateViews();
    this.drawTrails();
    this.updateNight();
    this.updatePlayerWarnings();
  }

  private rebuildTrailGrid(): void {
    this.trailGrid.clear();
    for (const car of this.cars) {
      if (!car.alive) continue;
      const pts = car.trail;
      // Skip the newest 2 points — they sit under the owner's own bumper.
      for (let i = 0; i < pts.length - 2; i++) {
        this.trailGrid.insert({ x: pts[i].x, y: pts[i].y, owner: car.id, data: i });
      }
    }
  }

  private handleCollisions(time: number): void {
    const size = this.arena.size;

    for (const car of this.cars) {
      if (!car.alive) continue;

      // Nose position (kills register at the front of the car).
      const noseX = car.x + Math.cos(car.heading) * CAR_RADIUS;
      const noseY = car.y + Math.sin(car.heading) * CAR_RADIUS;

      // Walls.
      if (
        car.x < WALL_MARGIN + CAR_RADIUS ||
        car.y < WALL_MARGIN + CAR_RADIUS ||
        car.x > size - WALL_MARGIN - CAR_RADIUS ||
        car.y > size - WALL_MARGIN - CAR_RADIUS
      ) {
        this.wreck(car, 'wall');
        continue;
      }

      // Rival trails — the core kill mechanic.
      let killerId = -1;
      this.trailGrid.query(noseX, noseY, TRAIL_HIT_RADIUS, (p) => {
        if (p.owner !== car.id) {
          killerId = p.owner;
          return true;
        }
      });
      if (killerId >= 0) {
        this.wreck(car, 'trail', killerId);
        continue;
      }

      // Fuel death: engine died and the car has rolled to a stop.
      if (car.fuel <= 0 && Math.abs(car.speed) < 8 && Math.hypot(car.vx, car.vy) < 12) {
        this.wreck(car, 'fuel');
        continue;
      }

      // Orbs.
      this.orbGrid.query(car.x, car.y, ORB_EAT_RADIUS, (p) => {
        car.eatOrb();
        this.respawnOrb(p.data);
        if (car === this.player) sfx.pickup();
        this.burstAt(p.x, p.y, 3, PALETTE.cyan);
      });

      // Scrap from wrecks: worth more fuel + growth.
      for (let i = this.scraps.length - 1; i >= 0; i--) {
        const scrap = this.scraps[i];
        const dx = scrap.x - car.x;
        const dy = scrap.y - car.y;
        if (dx * dx + dy * dy < ORB_EAT_RADIUS * ORB_EAT_RADIUS) {
          car.eatOrb(4, 2);
          if (car === this.player) sfx.scrapPickup();
          scrap.sprite.destroy();
          this.scraps.splice(i, 1);
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
          if (car === this.player) sfx.spin();
        } else if (h.kind === 'cone') {
          if (car.slowTimer <= 0.1) {
            car.slowTimer = 0.6;
            if (car === this.player) sfx.bump();
          }
          // Knock the cone away.
          const knockAngle = Math.atan2(-dy, -dx) + (Math.random() - 0.5) * 0.8;
          h.x = Phaser.Math.Clamp(h.x + Math.cos(knockAngle) * 70, 80, size - 80);
          h.y = Phaser.Math.Clamp(h.y + Math.sin(knockAngle) * 70, 80, size - 80);
          this.tweens.add({ targets: h.sprite, x: h.x, y: h.y, angle: h.sprite.angle + 200, duration: 250, ease: 'Cubic.out' });
        } else if (h.kind === 'pothole' && car.slowTimer <= 0.1) {
          car.slowTimer = 0.9;
          car.loseTrail(6);
          if (car.takeHit()) {
            this.wreck(car, 'hazard');
          } else if (car === this.player) {
            sfx.bump();
            this.cameras.main.shake(120, 0.004);
          }
        }
      }
      if (!car.alive) continue;
    }

    // Car-vs-car bumps: soft push apart, no kill (heads don't kill in .io style).
    for (let i = 0; i < this.cars.length; i++) {
      const a = this.cars[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < this.cars.length; j++) {
        const b = this.cars[j];
        if (!b.alive) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const minD = CAR_RADIUS * 2;
        if (d2 < minD * minD && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = (minD - d) / 2;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
          a.speed *= 0.92;
          b.speed *= 0.92;
          if ((a === this.player || b === this.player) && push > 2) sfx.bump();
        }
      }
    }

    // Scrap expiry.
    for (let i = this.scraps.length - 1; i >= 0; i--) {
      if (time > this.scraps[i].expiresAt) {
        this.scraps[i].sprite.destroy();
        this.scraps.splice(i, 1);
      }
    }
  }

  // ---------- Deaths & respawns ----------

  private wreck(car: CarSim, cause: CauseOfDeath, killerId = -1): void {
    if (!car.alive) return;
    car.alive = false;

    const killer = this.cars.find((c) => c.id === killerId);
    if (killer?.alive && cause === 'trail') {
      killer.kills++;
      this.events.emit('killfeed', { killer: killer.driver.name, victim: car.driver.name });
    } else if (cause !== 'trail') {
      this.events.emit('killfeed', {
        killer: cause === 'wall' ? 'THE WALL' : cause === 'fuel' ? 'EMPTY TANK' : 'THE ROAD',
        victim: car.driver.name,
      });
    }

    // Drop the trail as scrap — the .io feast.
    const pts = car.trail;
    for (let i = 0; i < pts.length; i += 3) {
      const sprite = this.add
        .image(pts[i].x, pts[i].y, 'orb')
        .setTint(PALETTE.amber)
        .setScale(1.15)
        .setDepth(3);
      this.scraps.push({ x: pts[i].x, y: pts[i].y, sprite, expiresAt: this.time.now + 25_000 });
    }

    // Explosion.
    this.burstAt(car.x, car.y, 26, PALETTE.amber);
    this.burstAt(car.x, car.y, 14, 0xff5a1f);
    if (car === this.player) {
      sfx.wreck();
      this.cameras.main.shake(350, 0.012);
      this.cameras.main.flash(200, 255, 120, 40);
    } else {
      sfx.explosion();
    }

    const view = this.views.get(car.id)!;
    view.container.setVisible(false);

    if (car === this.player) {
      this.endRun(cause, killer?.driver.name);
    } else {
      this.botRespawns.push({ at: this.time.now + 3500, carId: car.id });
    }
  }

  private handleRespawns(time: number): void {
    for (let i = this.botRespawns.length - 1; i >= 0; i--) {
      const r = this.botRespawns[i];
      if (time < r.at) continue;
      this.botRespawns.splice(i, 1);
      const car = this.cars.find((c) => c.id === r.carId);
      if (!car) continue;
      const pos = this.randomOpenPos(250);
      car.alive = true;
      car.fuel = car.stats.tank;
      car.hitPoints = car.stats.armor;
      car.trailLimit = MIN_TRAIL + Math.floor(Math.random() * 10);
      car.kills = 0;
      car.spawnAt(pos.x, pos.y, Math.random() * Math.PI * 2);
      this.views.get(car.id)!.container.setVisible(true);
    }
  }

  private endRun(cause: CauseOfDeath, killedBy?: string): void {
    if (this.playerDead) return;
    this.playerDead = true;
    const survivalMs = this.time.now - this.runStart;
    const raw = {
      score: this.player.score,
      kills: this.player.kills,
      orbsEaten: this.player.orbsEaten,
      survivalMs,
      bestRank: this.bestRank,
      causeOfDeath: cause,
      envId: this.arena.envId,
      night: this.arena.night,
      killedBy,
    };
    const result: RunResult = applyRewards(raw, this.arena.rewardMult);
    const boostMs = this.player.boostMs;

    this.time.delayedCall(1400, () => {
      this.scene.stop('hud');
      this.scene.start('results', { result, boostMs, arenaId: this.arena.id });
    });
  }

  // ---------- Rendering ----------

  private updateRanks(): void {
    const ranked = this.cars.filter((c) => c.alive).sort((a, b) => b.score - a.score);
    ranked.forEach((c, i) => (c.rank = i + 1));
    if (this.player.alive) this.bestRank = Math.min(this.bestRank, this.player.rank);
  }

  private updateViews(): void {
    for (const car of this.cars) {
      if (!car.alive) continue;
      const view = this.views.get(car.id)!;
      view.container.setPosition(car.x, car.y);
      view.sprite.setRotation(car.heading);
      view.label.setRotation(0);
    }
  }

  private drawTrails(): void {
    const g = this.trailGfx;
    g.clear();
    for (const car of this.cars) {
      if (!car.alive || car.trail.length < 2) continue;
      const pts = car.trail;
      const colors = car.trailColors;
      const n = pts.length;
      for (let i = 1; i < n; i++) {
        // Head (newest, end of array) = colors[0]; tail = last color.
        const frac = 1 - i / n;
        const color = sampleGradient(colors, frac);
        const alphaScale = car.boosting ? 1.25 : 1;
        // Outer glow pass.
        g.lineStyle(13, color, 0.16 * alphaScale);
        g.lineBetween(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
        // Bright core.
        g.lineStyle(4.5, color, Math.min(1, 0.5 + 0.45 * (i / n)) * alphaScale);
        g.lineBetween(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
      }
    }
  }

  private updateNight(): void {
    if (!this.darkness) return;
    const rt = this.darkness;
    rt.clear();
    rt.fill(0x000008, 0.94);
    const cam = this.cameras.main;

    for (const car of this.cars) {
      if (!car.alive) continue;
      // RT pixels are 1:1 with world pixels (layoutDarkness), so no zoom here.
      const sx = car.x - cam.worldView.x;
      const sy = car.y - cam.worldView.y;
      if (sx < -300 || sy < -300 || sx > rt.width + 300 || sy > rt.height + 300) continue;
      const isPlayer = car === this.player;
      // Ambient pool around the car + headlight cone in the heading direction.
      const pool = this.make
        .image({ x: sx, y: sy, key: 'glow', add: false })
        .setScale(isPlayer ? 1.7 : 0.9);
      rt.erase(pool, sx, sy);
      pool.destroy();
      const light = this.make
        .image({ x: sx, y: sy, key: 'headlight', add: false })
        .setOrigin(0.09, 0.5)
        .setRotation(car.heading)
        .setScale(isPlayer ? 1.5 : 0.7);
      rt.erase(light, sx, sy);
      light.destroy();
    }
  }

  private updatePlayerWarnings(): void {
    if (!this.player.alive) return;
    const frac = this.player.fuel / this.player.stats.tank;
    if (frac < 0.2 && !this.lowFuelWarned) {
      this.lowFuelWarned = true;
      sfx.lowFuel();
      this.time.delayedCall(2500, () => (this.lowFuelWarned = false));
    }
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

/** Sample a color gradient (array of stops) at t in 0..1 (0 = first color). */
export function sampleGradient(colors: number[], t: number): number {
  if (colors.length === 1) return colors[0];
  const clamped = Math.max(0, Math.min(0.999, t));
  const scaled = clamped * (colors.length - 1);
  const idx = Math.floor(scaled);
  const frac = scaled - idx;
  const c1 = Phaser.Display.Color.ValueToColor(colors[idx]);
  const c2 = Phaser.Display.Color.ValueToColor(colors[idx + 1]);
  const mixed = Phaser.Display.Color.Interpolate.ColorWithColor(c1, c2, 100, frac * 100);
  return Phaser.Display.Color.GetColor(mixed.r, mixed.g, mixed.b);
}

export { TRAIL_SPACING };
