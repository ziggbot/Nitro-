import Phaser from 'phaser';
import { ENV_PALETTES, hexToCss } from '../config/palette';
import carSportsUrl from '../../assets/svg/car-sports.svg?url';
import carRacerUrl from '../../assets/svg/car-racer.svg?url';
import carBuggyUrl from '../../assets/svg/car-buggy.svg?url';
import carRocketUrl from '../../assets/svg/car-rocket.svg?url';
import carElectricUrl from '../../assets/svg/car-electric.svg?url';

/**
 * Generates every non-SVG texture procedurally at boot (floors, orbs,
 * hazards, particles) so the whole game ships with zero binary assets.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    this.load.svg('car-sports', carSportsUrl, { width: 96, height: 56 });
    this.load.svg('car-racer', carRacerUrl, { width: 96, height: 56 });
    this.load.svg('car-buggy', carBuggyUrl, { width: 96, height: 56 });
    this.load.svg('car-rocket', carRocketUrl, { width: 96, height: 56 });
    this.load.svg('car-electric', carElectricUrl, { width: 96, height: 56 });
  }

  create(): void {
    this.makeGlow('orb', 28, '#ffffff');
    this.makeGlow('glow', 96, '#ffffff');
    this.makeDot();
    this.makeCone();
    this.makeOil();
    this.makePothole();
    this.makeHeadlight();
    this.makeJerryCan();
    this.makeGasBottle();
    this.makeBattery();
    this.makeBarrel();
    this.makeWheel();
    this.makeKnob();
    this.makeDaylightCobbles();
    this.makeDaylightGrass();
    this.makeDaylightSand();
    this.makeVent();
    this.makeCrate();
    this.makeAwning();
    for (const envId of Object.keys(ENV_PALETTES)) this.makeFloor(envId);
    this.scene.start('menu');
  }

  /** Soft radial glow drawn behind a pickup icon, in the same texture. */
  private glowBehind(ctx: CanvasRenderingContext2D, w: number, h: number, color: string): void {
    const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, Math.max(w, h) / 2);
    g.addColorStop(0, color + '66');
    g.addColorStop(1, color + '00');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  /** Petrol jerry can — refuels heavily. */
  private makeJerryCan(): void {
    this.canvasTexture('pickup-fuel', 44, 44, (ctx) => {
      this.glowBehind(ctx, 44, 44, '#ffb020');
      ctx.fillStyle = '#e04818';
      ctx.beginPath();
      ctx.roundRect(13, 14, 18, 20, 3);
      ctx.fill();
      // Spout + handle.
      ctx.fillRect(26, 10, 5, 5);
      ctx.strokeStyle = '#e04818';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(15, 12);
      ctx.lineTo(24, 12);
      ctx.stroke();
      // Embossed X.
      ctx.strokeStyle = '#ffd9a0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(16, 18);
      ctx.lineTo(28, 30);
      ctx.moveTo(28, 18);
      ctx.lineTo(16, 30);
      ctx.stroke();
    });
  }

  /** Gas bottle — grows the trail extra. */
  private makeGasBottle(): void {
    this.canvasTexture('pickup-gas', 44, 44, (ctx) => {
      this.glowBehind(ctx, 44, 44, '#00f0ff');
      ctx.fillStyle = '#0b9cc4';
      ctx.beginPath();
      ctx.roundRect(15, 13, 14, 23, 6);
      ctx.fill();
      // Collar + valve.
      ctx.fillStyle = '#0e7a99';
      ctx.fillRect(18, 9, 8, 5);
      ctx.fillStyle = '#dff6ff';
      ctx.fillRect(20, 6, 4, 4);
      // Label stripe.
      ctx.fillStyle = '#bdf0ff';
      ctx.fillRect(17, 21, 10, 5);
    });
  }

  /** Battery (for the EV crowd) — balanced charge. Oversized for visibility. */
  private makeBattery(): void {
    this.canvasTexture('pickup-battery', 58, 58, (ctx) => {
      this.glowBehind(ctx, 58, 58, '#a8ff3e');
      ctx.fillStyle = '#3e9c28';
      ctx.beginPath();
      ctx.roundRect(17, 17, 24, 32, 4);
      ctx.fill();
      // Terminals.
      ctx.fillStyle = '#d8e8dc';
      ctx.fillRect(21, 13, 5, 5);
      ctx.fillRect(32, 13, 5, 5);
      // Lightning bolt.
      ctx.fillStyle = '#eaffb0';
      ctx.beginPath();
      ctx.moveTo(32, 21);
      ctx.lineTo(22, 34.5);
      ctx.lineTo(28, 34.5);
      ctx.lineTo(26, 45);
      ctx.lineTo(36, 31.5);
      ctx.lineTo(30, 31.5);
      ctx.closePath();
      ctx.fill();
    });
  }

  /** The NITRO barrel from the 1990 original — big, bold, unmissable. */
  private makeBarrel(): void {
    this.canvasTexture('pickup-barrel', 74, 74, (ctx) => {
      this.glowBehind(ctx, 74, 74, '#ffd166');
      ctx.fillStyle = '#d98a1f';
      ctx.beginPath();
      ctx.roundRect(21, 16, 32, 42, 9);
      ctx.fill();
      // Barrel hoops.
      ctx.fillStyle = '#8f5510';
      ctx.fillRect(21, 24, 32, 4.5);
      ctx.fillRect(21, 45, 32, 4.5);
      // Shine.
      ctx.fillStyle = '#ffce7a';
      ctx.fillRect(26, 18, 5, 38);
      // "N" for nitro.
      ctx.fillStyle = '#fff6dd';
      ctx.font = 'bold 15px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('N', 40, 42);
    });
  }

  private canvasTexture(
    key: string,
    w: number,
    h: number,
    draw: (ctx: CanvasRenderingContext2D) => void,
  ): void {
    if (this.textures.exists(key)) return;
    const tex = this.textures.createCanvas(key, w, h);
    if (!tex) return;
    draw(tex.getContext());
    tex.refresh();
  }

  /** Soft radial glow — used for orbs, particles, headlight erase, explosions. */
  private makeGlow(key: string, size: number, color: string): void {
    this.canvasTexture(key, size, size, (ctx) => {
      const half = size / 2;
      const g = ctx.createRadialGradient(half, half, 0, half, half, half);
      g.addColorStop(0, color);
      g.addColorStop(0.35, color + 'cc');
      g.addColorStop(1, color + '00');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    });
  }

  private makeDot(): void {
    this.canvasTexture('dot', 8, 8, (ctx) => {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(4, 4, 3.4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private makeCone(): void {
    this.canvasTexture('cone', 26, 26, (ctx) => {
      ctx.fillStyle = '#ff7b1f';
      ctx.beginPath();
      ctx.arc(13, 13, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(13, 13, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff7b1f';
      ctx.beginPath();
      ctx.arc(13, 13, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private makeOil(): void {
    this.canvasTexture('oil', 84, 56, (ctx) => {
      ctx.fillStyle = 'rgba(20, 30, 80, 0.85)';
      ctx.beginPath();
      ctx.ellipse(42, 28, 38, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(60, 90, 200, 0.5)';
      ctx.beginPath();
      ctx.ellipse(36, 24, 20, 10, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(120, 170, 255, 0.35)';
      ctx.beginPath();
      ctx.ellipse(50, 32, 10, 5, 0.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private makePothole(): void {
    this.canvasTexture('pothole', 52, 52, (ctx) => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.beginPath();
      // Rough-edged crater.
      for (let i = 0; i <= 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const r = 20 + Math.sin(i * 2.7) * 4;
        const x = 26 + Math.cos(a) * r;
        const y = 26 + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
      ctx.beginPath();
      ctx.arc(26, 26, 12, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  /** Elongated cone of light for night-mode headlights (erased from darkness). */
  private makeHeadlight(): void {
    this.canvasTexture('headlight', 256, 128, (ctx) => {
      const g = ctx.createRadialGradient(24, 64, 4, 24, 64, 232);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.7)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(10, 64);
      ctx.lineTo(250, 6);
      ctx.lineTo(256, 64);
      ctx.lineTo(250, 122);
      ctx.closePath();
      ctx.fill();
    });
  }

  /** Steering-wheel base for the touch joystick (drawn white, tinted in HUD). */
  private makeWheel(): void {
    this.canvasTexture('wheel', 144, 144, (ctx) => {
      const c = 72;
      ctx.strokeStyle = '#ffffff';
      // Rim.
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.arc(c, c, 62, 0, Math.PI * 2);
      ctx.stroke();
      // Three spokes.
      ctx.lineWidth = 7;
      for (const a of [Math.PI / 2, Math.PI / 2 + (Math.PI * 2) / 3, Math.PI / 2 - (Math.PI * 2) / 3]) {
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * 14, c + Math.sin(a) * 14);
        ctx.lineTo(c + Math.cos(a) * 57, c + Math.sin(a) * 57);
        ctx.stroke();
      }
      // Hub.
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(c, c, 15, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  /** Draggable thumb knob for the joystick. */
  private makeKnob(): void {
    this.canvasTexture('knob', 60, 60, (ctx) => {
      const g = ctx.createRadialGradient(30, 24, 4, 30, 30, 28);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#9fc6e8');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(30, 30, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(30, 30, 26, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  /** Daylight cobblestone sidewalk tile — the original's bright city look. */
  private makeDaylightCobbles(): void {
    this.canvasTexture('floor-city-day', 256, 256, (ctx) => {
      ctx.fillStyle = '#9a9aa2';
      ctx.fillRect(0, 0, 256, 256);
      // Cobble grid: offset rows of stones with darker mortar lines.
      let seed = 4242;
      const rand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      const stone = 32;
      for (let row = 0; row < 256 / stone; row++) {
        const offset = row % 2 === 0 ? 0 : stone / 2;
        for (let col = -1; col < 256 / stone + 1; col++) {
          const x = col * stone + offset;
          const y = row * stone;
          const shade = 0.88 + rand() * 0.18;
          ctx.fillStyle = `rgb(${Math.round(150 * shade)}, ${Math.round(150 * shade)}, ${Math.round(158 * shade)})`;
          ctx.fillRect(x + 1.5, y + 1.5, stone - 3, stone - 3);
        }
      }
      ctx.strokeStyle = 'rgba(90, 90, 100, 0.5)';
      ctx.lineWidth = 1;
      for (let y = 0; y <= 256; y += stone) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(256, y + 0.5);
        ctx.stroke();
      }
    });
  }

  /** Daylight forest grass tile with mottled tufts. */
  private makeDaylightGrass(): void {
    this.canvasTexture('floor-forest-day', 256, 256, (ctx) => {
      ctx.fillStyle = '#5c7c40';
      ctx.fillRect(0, 0, 256, 256);
      let seed = 9137;
      const rand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      for (let i = 0; i < 420; i++) {
        const shade = rand();
        ctx.fillStyle = shade < 0.5 ? '#527238' : shade < 0.85 ? '#66884a' : '#4a6632';
        const x = rand() * 256;
        const y = rand() * 256;
        ctx.beginPath();
        ctx.ellipse(x, y, 2 + rand() * 5, 1.5 + rand() * 3, rand() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  /** Daylight desert sand tile with wind ripples. */
  private makeDaylightSand(): void {
    this.canvasTexture('floor-desert-day', 256, 256, (ctx) => {
      ctx.fillStyle = '#c8a86a';
      ctx.fillRect(0, 0, 256, 256);
      let seed = 5711;
      const rand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      // Wind ripples: soft curved strokes in lighter/darker sand.
      for (let i = 0; i < 46; i++) {
        ctx.strokeStyle = rand() < 0.5 ? 'rgba(180, 148, 88, 0.5)' : 'rgba(226, 198, 138, 0.55)';
        ctx.lineWidth = 1.5 + rand() * 2;
        const x = rand() * 256;
        const y = rand() * 256;
        const len = 30 + rand() * 60;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + len / 2, y - 6 - rand() * 8, x + len, y);
        ctx.stroke();
      }
      // Speckle grains.
      for (let i = 0; i < 180; i++) {
        ctx.fillStyle = rand() < 0.5 ? '#b8975a' : '#d8ba7e';
        ctx.fillRect(rand() * 256, rand() * 256, 2, 2);
      }
    });
  }

  /** Dark rooftop vent grate, like the original's roof details. */
  private makeVent(): void {
    this.canvasTexture('vent', 26, 26, (ctx) => {
      ctx.fillStyle = '#3a3a42';
      ctx.fillRect(1, 1, 24, 24);
      ctx.strokeStyle = '#1c1c22';
      ctx.lineWidth = 2;
      for (let i = 5; i < 24; i += 5) {
        ctx.beginPath();
        ctx.moveTo(3, i);
        ctx.lineTo(23, i);
        ctx.stroke();
      }
      ctx.strokeStyle = '#565660';
      ctx.strokeRect(1, 1, 24, 24);
    });
  }

  /** Wooden crate stack for the roadside. */
  private makeCrate(): void {
    this.canvasTexture('crate', 30, 30, (ctx) => {
      ctx.fillStyle = '#a8823c';
      ctx.fillRect(1, 1, 28, 28);
      ctx.strokeStyle = '#6e5424';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(2, 2, 26, 26);
      ctx.beginPath();
      ctx.moveTo(3, 3);
      ctx.lineTo(27, 27);
      ctx.moveTo(27, 3);
      ctx.lineTo(3, 27);
      ctx.stroke();
    });
  }

  /** Red/white striped shop awning with a gold trim — straight from 1990. */
  private makeAwning(): void {
    this.canvasTexture('awning', 72, 34, (ctx) => {
      const stripe = 12;
      for (let i = 0; i < 72 / stripe; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#d8283c' : '#f2f2f4';
        ctx.fillRect(i * stripe, 0, stripe, 28);
      }
      // Scalloped shadow at the hem + gold trim bar.
      ctx.fillStyle = 'rgba(60, 20, 24, 0.35)';
      ctx.fillRect(0, 22, 72, 6);
      ctx.fillStyle = '#b9902c';
      ctx.fillRect(0, 28, 72, 6);
    });
  }

  /** 256px tiling floor texture per environment: base tone, speckle, grid lines. */
  private makeFloor(envId: string): void {
    const pal = ENV_PALETTES[envId];
    this.canvasTexture(`floor-${envId}`, 256, 256, (ctx) => {
      ctx.fillStyle = hexToCss(pal.floorBase);
      ctx.fillRect(0, 0, 256, 256);
      // Deterministic speckle so tiles match seamlessly.
      let seed = 1234 + envId.length * 777;
      const rand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      ctx.fillStyle = hexToCss(pal.floorDetail);
      for (let i = 0; i < 320; i++) {
        const x = rand() * 256;
        const y = rand() * 256;
        const r = 0.6 + rand() * 2.2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Synthwave grid on tile edges (tiles align into a world grid).
      ctx.strokeStyle = hexToCss(pal.grid);
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 2;
      ctx.strokeRect(0.5, 0.5, 256, 256);
      ctx.globalAlpha = 1;
    });
  }
}
