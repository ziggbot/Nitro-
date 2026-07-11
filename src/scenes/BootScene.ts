import Phaser from 'phaser';
import { ENV_PALETTES, hexToCss } from '../config/palette';
import carSportsUrl from '../../assets/svg/car-sports.svg?url';
import carRacerUrl from '../../assets/svg/car-racer.svg?url';
import carBuggyUrl from '../../assets/svg/car-buggy.svg?url';

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

  /** Battery (for the EV crowd) — balanced charge. */
  private makeBattery(): void {
    this.canvasTexture('pickup-battery', 44, 44, (ctx) => {
      this.glowBehind(ctx, 44, 44, '#a8ff3e');
      ctx.fillStyle = '#3e9c28';
      ctx.beginPath();
      ctx.roundRect(13, 13, 18, 24, 3);
      ctx.fill();
      // Terminals.
      ctx.fillStyle = '#d8e8dc';
      ctx.fillRect(16, 10, 4, 4);
      ctx.fillRect(24, 10, 4, 4);
      // Lightning bolt.
      ctx.fillStyle = '#eaffb0';
      ctx.beginPath();
      ctx.moveTo(24, 16);
      ctx.lineTo(17, 26);
      ctx.lineTo(21.5, 26);
      ctx.lineTo(20, 34);
      ctx.lineTo(27, 24);
      ctx.lineTo(22.5, 24);
      ctx.closePath();
      ctx.fill();
    });
  }

  /** The NITRO barrel from the 1990 original — rare overdrive power-up. */
  private makeBarrel(): void {
    this.canvasTexture('pickup-barrel', 56, 56, (ctx) => {
      this.glowBehind(ctx, 56, 56, '#ffd166');
      ctx.fillStyle = '#d98a1f';
      ctx.beginPath();
      ctx.roundRect(16, 12, 24, 32, 7);
      ctx.fill();
      // Barrel hoops.
      ctx.fillStyle = '#8f5510';
      ctx.fillRect(16, 18, 24, 3.5);
      ctx.fillRect(16, 34, 24, 3.5);
      // Shine.
      ctx.fillStyle = '#ffce7a';
      ctx.fillRect(20, 14, 4, 28);
      // "N" for nitro.
      ctx.fillStyle = '#fff6dd';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('N', 30, 30.5);
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
