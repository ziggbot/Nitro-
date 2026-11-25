import Phaser from 'phaser';
import { loadSave } from '../meta/SaveGame';
import { fuelById } from '../config/fuels';
import { fitToScreen } from '../ui/widgets';

/**
 * Attract-mode intro: a hand-pixelled synthwave title card — rising sun,
 * scrolling skyline, a side-view pixel car spitting exhaust flames and the
 * NITRO.IO logo slamming in letter by letter. Every texture is drawn here
 * at 1px-per-pixel and displayed with NEAREST scaling for the chunky look.
 * Tap or press any key to skip; auto-continues to the menu.
 */

const DW = 960;
const DH = 540;

/** 5×7 pixel font — just the glyphs the logo needs. */
const GLYPHS: Record<string, string[]> = {
  N: ['10001', '11001', '11101', '10111', '10011', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
};

/** Side-view pixel car, 32×12. b=body h=highlight g=glass o=outline w=tyre r=rim */
const CAR_ROWS = [
  '................................',
  '..........oooooooooo............',
  '.........obggggggggbo...........',
  '....oooooobgggggggggboooooo.....',
  '...obbbbbbbbbbbbbbbbbbbbbbbo....',
  '..obhhhhhhhhhhhhhhhhhhhhhhhbo...',
  '..obbbbbbbbbbbbbbbbbbbbbbbbbo...',
  '..oobbbwwwwbbbbbbbbbbwwwwbboo...',
  '....owwwwwwwobbbbbbowwwwwwwo....',
  '....owwrrwwwo......owwrrwwwo....',
  '.....owwwwwo........owwwwwo.....',
  '......ooooo..........ooooo......',
];

const FLAME_A = ['..ff....', 'ffFFff..', 'fFFFFfff', 'ffFFff..', '..ff....'];
const FLAME_B = ['....ff..', '..fFFfff', 'ffFFFFf.', '..fFFfff', '....ff..'];

export class IntroScene extends Phaser.Scene {
  private roadTile?: Phaser.GameObjects.TileSprite;
  private skylineTile?: Phaser.GameObjects.TileSprite;
  private car?: Phaser.GameObjects.Image;
  private flame?: Phaser.GameObjects.Image;
  private wheelFrame = 0;
  private done = false;

  constructor() {
    super('intro');
  }

  create(): void {
    // Friends following a race/ghost link skip straight to the point.
    if (/#(join|ghost)=/.test(window.location.hash)) {
      this.scene.start('menu');
      return;
    }
    this.done = false;
    this.wheelFrame = 0;
    this.makeTextures();
    const fromIndex = this.children.list.length;

    // --- Sky: chunky gradient bands, purple to hot horizon. ---
    const bands = [0x0b0618, 0x140a28, 0x1d0e38, 0x2a1248, 0x3a1658, 0x551a60, 0x7a1e60, 0xa82658];
    const bandH = 300 / bands.length;
    bands.forEach((c, i) => this.add.rectangle(DW / 2, i * bandH + bandH / 2, DW, bandH + 1, c));

    // Stars.
    for (let i = 0; i < 44; i++) {
      const s = this.add
        .image(20 + Math.random() * (DW - 40), 10 + Math.random() * 190, 'px-star')
        .setScale(Math.random() < 0.3 ? 3 : 2)
        .setAlpha(0.25 + Math.random() * 0.6);
      this.tweens.add({
        targets: s,
        alpha: 0.15,
        duration: 400 + Math.random() * 900,
        yoyo: true,
        repeat: -1,
        delay: Math.random() * 1000,
      });
    }

    // Striped pixel sun rising behind the skyline.
    const sun = this.add.image(DW / 2, 420, 'px-sun').setScale(7);
    this.tweens.add({ targets: sun, y: 196, duration: 1600, ease: 'Cubic.out' });

    // Skyline silhouette (parallax-scrolls).
    this.skylineTile = this.add.tileSprite(DW / 2, 262, DW, 160, 'px-skyline').setTileScale(2.5);

    // Ground glow + road.
    this.add.rectangle(DW / 2, 390, DW, 100, 0x12081e);
    this.roadTile = this.add.tileSprite(DW / 2, 475, DW, 130, 'px-road').setTileScale(3.4);

    // The hero car + exhaust flame.
    this.flame = this.add.image(338, 448, 'px-flame-a').setScale(5).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    this.car = this.add.image(400, 444, 'px-car-a').setScale(5).setAlpha(0);
    this.car.x = -200;
    this.tweens.add({ targets: this.car, x: 430, alpha: 1, duration: 1100, delay: 500, ease: 'Cubic.out' });
    this.tweens.add({ targets: this.flame, alpha: 0.95, duration: 300, delay: 1500 });
    this.tweens.add({ targets: this.car, y: 442, duration: 160, yoyo: true, repeat: -1, delay: 1600 });

    // Speed lines.
    for (let i = 0; i < 7; i++) {
      const line = this.add.rectangle(DW + Math.random() * 500, 400 + Math.random() * 120, 70, 3, 0xffffff, 0.22);
      this.tweens.add({
        targets: line,
        x: -120,
        duration: 480 + Math.random() * 400,
        repeat: -1,
        delay: 900 + Math.random() * 800,
        onRepeat: () => {
          line.y = 400 + Math.random() * 120;
        },
      });
    }

    // --- Logo: letters slam in one by one. ---
    const word = 'NITRO.IO';
    const scale = 9;
    const letterW = 6 * scale;
    const x0 = DW / 2 - (word.length * letterW) / 2 + letterW / 2;
    [...word].forEach((ch, i) => {
      const img = this.add.image(x0 + i * letterW, -70, `px-glyph-${ch === '.' ? 'dot' : ch}`).setScale(scale);
      this.tweens.add({
        targets: img,
        y: 128,
        duration: 520,
        delay: 1700 + i * 110,
        ease: 'Bounce.out',
        onComplete: () => {
          if (i === word.length - 1) this.cameras.main.shake(130, 0.004);
        },
      });
    });

    const sub = this.add
      .text(DW / 2, 212, 'DRIFT · RACE · WRECK YOUR RIVALS', {
        fontFamily: '"Courier New", monospace',
        fontSize: '20px',
        color: '#7fe8ff',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: sub, alpha: 1, duration: 500, delay: 2900 });

    const press = this.add
      .text(DW / 2, 378, '▶ TAP OR PRESS ANY KEY ◀', {
        fontFamily: '"Courier New", monospace',
        fontSize: '24px',
        color: '#ffd24a',
        stroke: '#000000',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.time.delayedCall(3200, () => {
      this.tweens.add({ targets: press, alpha: { from: 1, to: 0.15 }, duration: 480, yoyo: true, repeat: -1 });
    });

    this.add
      .text(DW / 2, DH - 14, 'A TRIBUTE TO NITRO (PSYGNOSIS, 1990)', {
        fontFamily: '"Courier New", monospace',
        fontSize: '13px',
        color: '#8a8ab8',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    fitToScreen(this, fromIndex, DW, DH);

    // CRT scanlines over everything, sized to the real screen.
    this.add
      .tileSprite(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 'px-scan')
      .setDepth(100)
      .setAlpha(0.5);

    // Wheel spin + flame flicker.
    this.time.addEvent({
      delay: 90,
      loop: true,
      callback: () => {
        this.wheelFrame ^= 1;
        this.car?.setTexture(this.wheelFrame ? 'px-car-b' : 'px-car-a');
        this.flame?.setTexture(this.wheelFrame ? 'px-flame-b' : 'px-flame-a');
        if (this.flame) this.flame.setScale(4.6 + Math.random() * 0.9);
      },
    });

    // Skip on any input (after a beat, so a stray tap doesn't eat it).
    this.time.delayedCall(600, () => {
      this.input.once('pointerdown', () => this.finish());
      this.input.keyboard?.once('keydown', () => this.finish());
    });
    this.time.delayedCall(11_000, () => this.finish());
  }

  update(): void {
    if (this.roadTile) this.roadTile.tilePositionX += 6;
    if (this.skylineTile) this.skylineTile.tilePositionX += 0.35;
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.cameras.main.fadeOut(350, 5, 3, 13);
    this.time.delayedCall(360, () => this.scene.start('menu'));
  }

  // ---------- Pixel texture generation ----------

  private makeTextures(): void {
    if (this.textures.exists('px-star')) return;
    const save = loadSave();
    const body = Phaser.Display.Color.IntegerToColor(fuelById(save.selectedFuel).color);
    const bodyHex = `rgb(${body.red},${body.green},${body.blue})`;
    const hiHex = `rgb(${Math.min(255, body.red + 70)},${Math.min(255, body.green + 70)},${Math.min(255, body.blue + 70)})`;

    this.pixelTexture('px-star', ['010', '111', '010'], { '1': '#ffffff' });
    this.pixelTexture('px-scan', ['0', '0', '1'], { '1': 'rgba(0,0,0,0.42)' });

    const carPal: Record<string, string> = {
      o: '#0c0c14',
      b: bodyHex,
      h: hiHex,
      g: '#9fe8ff',
      w: '#16161e',
      r: '#c8ccd6',
    };
    this.pixelTexture('px-car-a', CAR_ROWS, carPal);
    // Frame B: rims rotated (swap rim pixels one step) — cheap spin.
    this.pixelTexture(
      'px-car-b',
      CAR_ROWS.map((row) => row.replace(/rr/g, 'Rr')),
      { ...carPal, R: '#5a5e6a' },
    );
    this.pixelTexture('px-flame-a', FLAME_A, { f: '#ff8a1f', F: '#fff6c0' });
    this.pixelTexture('px-flame-b', FLAME_B, { f: '#ff5a1f', F: '#ffd24a' });

    // Glyphs: gold face, darker lower third, black drop shadow.
    for (const [ch, rows] of Object.entries(GLYPHS)) {
      const key = `px-glyph-${ch === '.' ? 'dot' : ch}`;
      const canvas = this.textures.createCanvas(key, 7, 9);
      if (!canvas) continue;
      const ctx = canvas.getContext();
      rows.forEach((row, y) => {
        [...row].forEach((bit, x) => {
          if (bit !== '1') return;
          ctx.fillStyle = '#000000';
          ctx.fillRect(x + 1, y + 1, 1, 1); // shadow offset
        });
      });
      rows.forEach((row, y) => {
        [...row].forEach((bit, x) => {
          if (bit !== '1') return;
          ctx.fillStyle = y >= 5 ? '#c8861e' : '#ffd24a';
          ctx.fillRect(x, y, 1, 1);
        });
      });
      canvas.refresh();
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }

    // Sun: striped synthwave disc.
    const sun = this.textures.createCanvas('px-sun', 41, 41);
    if (sun) {
      const ctx = sun.getContext();
      for (let y = 0; y < 41; y++) {
        // Lower half gets widening gap stripes.
        if (y > 22 && (y % 5 === 0 || y % 5 === 1)) continue;
        const t = y / 41;
        const r = Math.round(255 - t * 40);
        const g = Math.round(90 + t * 60);
        const b = Math.round(160 - t * 90);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        const half = Math.floor(Math.sqrt(Math.max(0, 20 * 20 - (y - 20) * (y - 20))));
        ctx.fillRect(20 - half, y, half * 2 + 1, 1);
      }
      sun.refresh();
      this.textures.get('px-sun').setFilter(Phaser.Textures.FilterMode.NEAREST);
    }

    // Skyline: random dark towers with lit windows (seeded by nothing —
    // it's decorative and regenerated per page load only).
    const sky = this.textures.createCanvas('px-skyline', 384, 64);
    if (sky) {
      const ctx = sky.getContext();
      let x = 0;
      while (x < 384) {
        const w = 14 + Math.floor(Math.random() * 22);
        const h = 18 + Math.floor(Math.random() * 42);
        ctx.fillStyle = '#0a0714';
        ctx.fillRect(x, 64 - h, w, h);
        ctx.fillStyle = Math.random() < 0.5 ? '#ff3b9e' : '#19c8ff';
        for (let wy = 64 - h + 3; wy < 61; wy += 5) {
          for (let wx = x + 2; wx < x + w - 2; wx += 4) {
            if (Math.random() < 0.4) ctx.fillRect(wx, wy, 2, 2);
          }
        }
        x += w + 2 + Math.floor(Math.random() * 6);
      }
      sky.refresh();
      this.textures.get('px-skyline').setFilter(Phaser.Textures.FilterMode.NEAREST);
    }

    // Road tile: asphalt with center dashes and edge lines.
    this.pixelTexture(
      'px-road',
      [
        'dddddddddddddddd',
        'pppppppppppppppp',
        'aaaaaaaaaaaaaaaa',
        'aaaaaaaaaaaaaaaa',
        'aaaaaaaaaaaaaaaa',
        'aaaaaaaaaaaaaaaa',
        'aaaaaaaaaaaaaaaa',
        'llllllll........',
        'aaaaaaaaaaaaaaaa',
        'aaaaaaaaaaaaaaaa',
        'aaaaaaaaaaaaaaaa',
        'aaaaaaaaaaaaaaaa',
        'pppppppppppppppp',
      ],
      { d: '#2a1248', p: '#ff3b9e', a: '#14141c', l: '#e8e8ec' },
    );
  }

  /** Draw a pixel map 1:1 onto a canvas texture with NEAREST filtering. */
  private pixelTexture(key: string, rows: string[], palette: Record<string, string>): void {
    const h = rows.length;
    const w = rows[0].length;
    const canvas = this.textures.createCanvas(key, w, h);
    if (!canvas) return;
    const ctx = canvas.getContext();
    rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        const color = palette[ch];
        if (!color) return;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      });
    });
    canvas.refresh();
    this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}
