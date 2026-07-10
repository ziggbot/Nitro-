import Phaser from 'phaser';
import { CAR_CLASSES, UPGRADES, effectiveStats } from '../config/cars';
import { PAINTS, TRAIL_STYLES } from '../config/cosmetics';
import { PALETTE, hexToCss } from '../config/palette';
import { sfx } from '../game/sfx';
import { levelForXp } from '../meta/Progression';
import { loadSave, persistSave, type SaveData } from '../meta/SaveGame';
import { buyUpgrade, unlockedCars, unlockedPaints, unlockedTrails } from '../meta/Unlocks';
import { bodyStyle, makeButton, makePanel, titleStyle } from '../ui/widgets';

/** The modernized Nitro pit stop: cars, upgrades, cosmetics. */
export class GarageScene extends Phaser.Scene {
  private save!: SaveData;

  constructor() {
    super('garage');
  }

  create(): void {
    this.save = loadSave();
    this.buildUi();
  }

  private buildUi(): void {
    this.children.removeAll();
    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w / 2;

    this.add.rectangle(cx, h / 2, w, h, PALETTE.deepSpace);
    this.add.text(cx, 36, '🔧 PIT-STOP GARAGE', titleStyle(36)).setOrigin(0.5);
    this.add
      .text(cx, 74, `🔩 ${this.save.scrap} scrap  ·  Driver LVL ${levelForXp(this.save.xp)}`, bodyStyle(15, hexToCss(PALETTE.amber)))
      .setOrigin(0.5);

    // --- Car classes (left column). ---
    const carsOwned = unlockedCars(this.save);
    this.add.text(60, 108, 'CARS', titleStyle(18, hexToCss(PALETTE.uiText)));
    CAR_CLASSES.forEach((def, i) => {
      const y = 170 + i * 96;
      const owned = carsOwned.includes(def.id);
      const selected = this.save.selectedCar === def.id;
      const panel = makePanel(this, 170, y, 280, 86, selected ? 0.95 : 0.7);
      if (selected) panel.setStrokeStyle(2, PALETTE.lime);
      const img = this.add.image(80, y, def.texture).setScale(0.62);
      if (!owned) img.setTint(0x333a4a);
      else img.setTint(PAINTS.find((p) => p.id === this.save.selectedPaint)?.tint ?? 0xffffff);
      this.add.text(130, y - 32, def.name, bodyStyle(15, hexToCss(owned ? PALETTE.cyan : 0x667088)));
      this.add.text(130, y - 12, owned ? def.tagline : `🔒 Unlocks at level ${def.unlockLevel}`, bodyStyle(11, hexToCss(PALETTE.uiDim)));
      const stats = def.base;
      this.add.text(
        130,
        y + 6,
        `SPD ${Math.round(stats.topSpeed)} · GRIP ${(stats.traction * 100).toFixed(0)} · TANK ${stats.tank}`,
        bodyStyle(11, hexToCss(PALETTE.uiDim)),
      );
      if (owned && !selected) {
        makeButton(this, 250, y + 24, 100, 26, 'SELECT', () => {
          this.save.selectedCar = def.id;
          persistSave(this.save);
          this.buildUi();
        });
      } else if (selected) {
        this.add.text(210, y + 18, '✓ SELECTED', bodyStyle(12, hexToCss(PALETTE.lime)));
      }
    });

    // --- Upgrades for the selected car (center column). ---
    this.add.text(cx - 140, 108, `UPGRADES — ${CAR_CLASSES.find((c) => c.id === this.save.selectedCar)?.name ?? ''}`, titleStyle(18, hexToCss(PALETTE.uiText)));
    const carUps = this.save.upgrades[this.save.selectedCar] ?? {};
    UPGRADES.forEach((up, i) => {
      const y = 170 + i * 66;
      const level = carUps[up.id] ?? 0;
      const maxed = level >= up.maxLevel;
      makePanel(this, cx, y, 320, 58, 0.7);
      this.add.text(cx - 148, y - 22, up.name, bodyStyle(14, hexToCss(PALETTE.cyan)));
      this.add.text(cx - 148, y - 3, up.desc, bodyStyle(11, hexToCss(PALETTE.uiDim)));
      // Pips.
      for (let p = 0; p < up.maxLevel; p++) {
        this.add.rectangle(cx - 148 + p * 18, y + 16, 14, 8, p < level ? PALETTE.lime : 0x24304a).setOrigin(0, 0.5);
      }
      if (maxed) {
        this.add.text(cx + 80, y - 8, 'MAX', bodyStyle(14, hexToCss(PALETTE.gold)));
      } else {
        const cost = up.cost(level + 1);
        const btn = makeButton(this, cx + 108, y, 92, 32, `${cost}🔩`, () => {
          if (buyUpgrade(this.save, this.save.selectedCar, up.id)) {
            sfx.reward();
            persistSave(this.save);
            this.buildUi();
          }
        }, PALETTE.amber);
        btn.setEnabled(this.save.scrap >= cost);
      }
    });

    // Effective stats readout.
    const eff = effectiveStats(this.save.selectedCar, carUps);
    this.add.text(
      cx - 160,
      170 + UPGRADES.length * 66 - 20,
      `→ Effective: SPD ${Math.round(eff.topSpeed)} · ACC ${Math.round(eff.accel)} · GRIP ${(eff.traction * 100).toFixed(0)} · TANK ${Math.round(eff.tank)} · ARMOR ${eff.armor}`,
      bodyStyle(12, hexToCss(PALETTE.lime)),
    );

    // --- Cosmetics (right column). ---
    const paintsOwned = unlockedPaints(this.save);
    this.add.text(w - 330, 108, 'PAINT', titleStyle(18, hexToCss(PALETTE.uiText)));
    PAINTS.forEach((paint, i) => {
      const x = w - 320 + (i % 4) * 64;
      const y = 160 + Math.floor(i / 4) * 64;
      const owned = paintsOwned.includes(paint.id);
      const selected = this.save.selectedPaint === paint.id;
      const swatch = this.add
        .rectangle(x, y, 44, 44, owned ? paint.tint : 0x24304a, 1)
        .setStrokeStyle(selected ? 4 : 2, selected ? 0xffffff : PALETTE.uiPanelStroke);
      if (owned) {
        swatch.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
          sfx.click();
          this.save.selectedPaint = paint.id;
          persistSave(this.save);
          this.buildUi();
        });
      } else {
        this.add.text(x, y, '🔒', bodyStyle(14)).setOrigin(0.5);
      }
      if (!owned) {
        swatch.setInteractive().on('pointerover', () => this.showTip(x, y, paint.unlock.label));
      }
    });

    const trailsOwned = unlockedTrails(this.save);
    const trailTop = 160 + Math.ceil(PAINTS.length / 4) * 64 + 30;
    this.add.text(w - 330, trailTop - 34, 'TRAIL STYLE', titleStyle(18, hexToCss(PALETTE.uiText)));
    TRAIL_STYLES.forEach((style, i) => {
      const y = trailTop + i * 46;
      const owned = trailsOwned.includes(style.id);
      const selected = this.save.selectedTrail === style.id;
      const panel = this.add
        .rectangle(w - 210, y, 250, 38, PALETTE.uiPanel, 0.8)
        .setStrokeStyle(selected ? 3 : 1, selected ? 0xffffff : PALETTE.uiPanelStroke);
      // Gradient preview.
      style.colors.forEach((c, ci) => {
        this.add.rectangle(w - 320 + ci * 22, y, 20, 10, owned ? c : 0x24304a);
      });
      this.add.text(
        w - 320 + style.colors.length * 22 + 8,
        y - 8,
        owned ? style.name : `🔒 ${style.unlock.label}`,
        bodyStyle(12, hexToCss(owned ? PALETTE.uiText : PALETTE.uiDim)),
      );
      if (owned) {
        panel.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
          sfx.click();
          this.save.selectedTrail = style.id;
          persistSave(this.save);
          this.buildUi();
        });
      }
    });

    makeButton(this, cx, h - 44, 220, 44, '← BACK TO MENU', () => this.scene.start('menu'));
  }

  private showTip(x: number, y: number, label: string): void {
    const tip = this.add
      .text(x, y + 34, label, { ...bodyStyle(11), backgroundColor: '#101828', padding: { x: 6, y: 3 } })
      .setOrigin(0.5)
      .setDepth(100);
    this.time.delayedCall(1800, () => tip.destroy());
  }
}
