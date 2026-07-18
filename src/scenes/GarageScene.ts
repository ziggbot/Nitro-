import Phaser from 'phaser';
import { CAR_CLASSES, UPGRADES, effectiveStats } from '../config/cars';
import { PAINTS } from '../config/cosmetics';
import { FUELS } from '../config/fuels';
import { PALETTE, hexToCss } from '../config/palette';
import { sfx } from '../game/sfx';
import { levelForXp } from '../meta/Progression';
import { loadSave, persistSave, type SaveData } from '../meta/SaveGame';
import { buyUpgrade, unlockedCars, unlockedPaints } from '../meta/Unlocks';
import { bodyStyle, clearScene, fitToScreen, isNarrow, makeButton, makePanel, titleStyle } from '../ui/widgets';

/** The modernized Nitro pit stop: cars, upgrades, cosmetics. */
export class GarageScene extends Phaser.Scene {
  private save!: SaveData;
  private root?: Phaser.GameObjects.Container;

  constructor() {
    super('garage');
  }

  create(): void {
    this.save = loadSave();
    this.buildUi();
    this.scale.on('resize', this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.onResize, this);
    });
  }

  private onResize(): void {
    this.buildUi();
  }

  private buildUi(): void {
    clearScene(this);
    const w = this.scale.width;
    const h = this.scale.height;
    this.add.rectangle(w / 2, h / 2, w, h, PALETTE.deepSpace);

    const start = this.children.list.length;
    const narrow = isNarrow(this);
    if (narrow) this.buildNarrow();
    else this.buildWide();
    this.root = fitToScreen(this, start, narrow ? 420 : 960, narrow ? 1150 : 600);
  }

  // ---------- Wide (desktop / landscape) — 960×600 ----------

  private buildWide(): void {
    this.add.text(480, 36, '🔧 PIT-STOP GARAGE', titleStyle(32)).setOrigin(0.5);
    this.add
      .text(480, 72, `🔩 ${this.save.scrap} scrap  ·  Driver LVL ${levelForXp(this.save.xp)}`, bodyStyle(14, hexToCss(PALETTE.amber)))
      .setOrigin(0.5);

    this.add.text(50, 100, 'CARS', titleStyle(16, hexToCss(PALETTE.uiText)));
    CAR_CLASSES.forEach((_, i) => this.buildCarRow(i, 170, 168 + i * 96, 280, 88, false));

    this.add.text(330, 100, `UPGRADES — ${this.carName()}`, titleStyle(16, hexToCss(PALETTE.uiText)));
    UPGRADES.forEach((_, i) => this.buildUpgradeRow(i, 480, 168 + i * 64, 320, 56, false));
    this.buildEffectiveLine(320, 168 + UPGRADES.length * 64 - 16, 11);

    this.add.text(650, 100, 'PAINT', titleStyle(16, hexToCss(PALETTE.uiText)));
    this.buildPaints(672, 150, 58, 4);
    this.add.text(650, 268, 'FUEL TYPE', titleStyle(16, hexToCss(PALETTE.uiText)));
    this.buildFuels(790, 302, 44, 280);

    makeButton(this, 480, 566, 220, 44, '← BACK TO MENU', () => this.scene.start('menu'));
  }

  // ---------- Narrow (mobile portrait) — 420×1080 ----------

  private buildNarrow(): void {
    this.add.text(210, 34, '🔧 PIT-STOP GARAGE', titleStyle(24)).setOrigin(0.5);
    this.add
      .text(210, 64, `🔩 ${this.save.scrap} scrap  ·  LVL ${levelForXp(this.save.xp)}`, bodyStyle(13, hexToCss(PALETTE.amber)))
      .setOrigin(0.5);

    this.add.text(24, 88, 'CARS', titleStyle(15, hexToCss(PALETTE.uiText)));
    CAR_CLASSES.forEach((_, i) => this.buildCarRow(i, 210, 152 + i * 88, 384, 80, true));

    const upTop = 152 + CAR_CLASSES.length * 88 + 8;
    this.add.text(24, upTop - 22, `UPGRADES — ${this.carName()}`, titleStyle(15, hexToCss(PALETTE.uiText)));
    UPGRADES.forEach((_, i) => this.buildUpgradeRow(i, 210, upTop + 32 + i * 60, 384, 52, true));
    this.buildEffectiveLine(24, upTop + 32 + UPGRADES.length * 60 - 12, 10);

    const paintTop = upTop + 32 + UPGRADES.length * 60 + 26;
    this.add.text(24, paintTop - 20, 'PAINT', titleStyle(15, hexToCss(PALETTE.uiText)));
    this.buildPaints(48, paintTop + 26, 52, 7);

    const fuelTop = paintTop + 84;
    this.add.text(24, fuelTop - 18, 'FUEL TYPE', titleStyle(15, hexToCss(PALETTE.uiText)));
    this.buildFuels(210, fuelTop + 26, 42, 384);

    makeButton(this, 210, fuelTop + 26 + FUELS.length * 42 + 28, 300, 46, '← BACK TO MENU', () => this.scene.start('menu'));
  }

  // ---------- Shared building blocks ----------

  private carName(): string {
    return CAR_CLASSES.find((c) => c.id === this.save.selectedCar)?.name ?? '';
  }

  private buildCarRow(index: number, cx: number, cy: number, pw: number, ph: number, compact: boolean): void {
    const def = CAR_CLASSES[index];
    const owned = unlockedCars(this.save).includes(def.id);
    const selected = this.save.selectedCar === def.id;
    const panel = makePanel(this, cx, cy, pw, ph, selected ? 0.95 : 0.7);
    if (selected) panel.setStrokeStyle(2, PALETTE.lime);

    const left = cx - pw / 2;
    const img = this.add.image(left + 46, cy, def.texture).setScale(compact ? 0.5 : 0.6);
    img.setTint(owned ? (PAINTS.find((p) => p.id === this.save.selectedPaint)?.tint ?? 0xffffff) : 0x333a4a);

    const textX = left + 92;
    this.add.text(textX, cy - ph / 2 + 8, def.name, bodyStyle(14, hexToCss(owned ? PALETTE.cyan : 0x667088)));
    this.add.text(
      textX,
      cy - ph / 2 + 27,
      owned ? def.tagline : `🔒 Unlocks at level ${def.unlockLevel}`,
      bodyStyle(10, hexToCss(PALETTE.uiDim)),
    );
    this.add.text(
      textX,
      cy - ph / 2 + 43,
      `SPD ${Math.round(def.base.topSpeed)} · GRIP ${(def.base.traction * 100).toFixed(0)} · TANK ${def.base.tank}`,
      bodyStyle(10, hexToCss(PALETTE.uiDim)),
    );
    if (owned && !selected) {
      makeButton(this, cx + pw / 2 - 56, cy + ph / 2 - 18, 92, 24, 'SELECT', () => {
        this.save.selectedCar = def.id;
        persistSave(this.save);
        this.buildUi();
      });
    } else if (selected) {
      this.add.text(cx + pw / 2 - 100, cy + ph / 2 - 26, '✓ SELECTED', bodyStyle(11, hexToCss(PALETTE.lime)));
    }
  }

  private buildUpgradeRow(index: number, cx: number, cy: number, pw: number, ph: number, compact: boolean): void {
    const up = UPGRADES[index];
    const carUps = this.save.upgrades[this.save.selectedCar] ?? {};
    const level = carUps[up.id] ?? 0;
    const maxed = level >= up.maxLevel;
    makePanel(this, cx, cy, pw, ph, 0.7);
    const left = cx - pw / 2 + 14;
    this.add.text(left, cy - ph / 2 + 6, up.name, bodyStyle(13, hexToCss(PALETTE.cyan)));
    this.add.text(left, cy - ph / 2 + 24, up.desc, bodyStyle(compact ? 9 : 10, hexToCss(PALETTE.uiDim)));
    for (let p = 0; p < up.maxLevel; p++) {
      this.add.rectangle(left + p * 17, cy + ph / 2 - 10, 13, 7, p < level ? PALETTE.lime : 0x24304a).setOrigin(0, 0.5);
    }
    if (maxed) {
      this.add.text(cx + pw / 2 - 52, cy - 9, 'MAX', bodyStyle(13, hexToCss(PALETTE.gold)));
    } else {
      const cost = up.cost(level + 1);
      const btn = makeButton(this, cx + pw / 2 - 50, cy, 82, 30, `${cost}🔩`, () => {
        if (buyUpgrade(this.save, this.save.selectedCar, up.id)) {
          sfx.reward();
          persistSave(this.save);
          this.buildUi();
        }
      }, PALETTE.amber);
      btn.setEnabled(this.save.scrap >= cost);
    }
  }

  private buildEffectiveLine(x: number, y: number, size: number): void {
    const eff = effectiveStats(this.save.selectedCar, this.save.upgrades[this.save.selectedCar] ?? {});
    this.add.text(
      x,
      y,
      `→ SPD ${Math.round(eff.topSpeed)} · ACC ${Math.round(eff.accel)} · GRIP ${(eff.traction * 100).toFixed(0)} · TANK ${Math.round(eff.tank)} · ARMOR ${eff.armor}`,
      bodyStyle(size, hexToCss(PALETTE.lime)),
    );
  }

  private buildPaints(startX: number, startY: number, cell: number, perRow: number): void {
    const owned = unlockedPaints(this.save);
    PAINTS.forEach((paint, i) => {
      const x = startX + (i % perRow) * cell;
      const y = startY + Math.floor(i / perRow) * cell;
      const has = owned.includes(paint.id);
      const selected = this.save.selectedPaint === paint.id;
      const swatch = this.add
        .rectangle(x, y, cell - 12, cell - 12, has ? paint.tint : 0x24304a, 1)
        .setStrokeStyle(selected ? 4 : 2, selected ? 0xffffff : PALETTE.uiPanelStroke);
      swatch.setInteractive({ useHandCursor: has }).on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (pointer.getDistance() > 16) return;
        if (has) {
          sfx.click();
          this.save.selectedPaint = paint.id;
          persistSave(this.save);
          this.buildUi();
        } else {
          this.showTip(x, y + cell * 0.7, paint.unlock.label);
        }
      });
      if (!has) this.add.text(x, y, '🔒', bodyStyle(13)).setOrigin(0.5);
    });
  }

  /** Fuel type: free choice, defines the car's trail & exhaust identity. */
  private buildFuels(cx: number, startY: number, rowH: number, pw: number): void {
    FUELS.forEach((fuel, i) => {
      const y = startY + i * rowH;
      const selected = this.save.selectedFuel === fuel.id;
      const panel = this.add
        .rectangle(cx, y, pw - 20, rowH - 6, PALETTE.uiPanel, 0.8)
        .setStrokeStyle(selected ? 3 : 1, selected ? 0xffffff : PALETTE.uiPanelStroke);
      const left = cx - (pw - 20) / 2 + 12;
      fuel.trailColors.forEach((c, ci) => {
        this.add.rectangle(left + ci * 20, y, 18, 9, c);
      });
      this.add.text(
        left + fuel.trailColors.length * 20 + 10,
        y - 8,
        `${fuel.emoji} ${fuel.name}`,
        bodyStyle(12, hexToCss(selected ? PALETTE.uiText : PALETTE.uiDim)),
      );
      panel.setInteractive({ useHandCursor: true }).on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (pointer.getDistance() > 16) return;
        sfx.click();
        this.save.selectedFuel = fuel.id;
        persistSave(this.save);
        this.buildUi();
      });
    });
  }

  /** Tooltip at design-space coordinates (added into the scaled root). */
  private showTip(x: number, y: number, label: string): void {
    const tip = this.add
      .text(x, y, label, { ...bodyStyle(11), backgroundColor: '#101828', padding: { x: 6, y: 3 } })
      .setOrigin(0.5)
      .setDepth(100);
    this.root?.add(tip);
    this.time.delayedCall(1800, () => tip.destroy());
  }
}
