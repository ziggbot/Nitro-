import Phaser from 'phaser';
import { CAR_CLASSES, UPGRADES, effectiveStats } from '../config/cars';
import { FUELS, fuelById } from '../config/fuels';
import { PALETTE, hexToCss } from '../config/palette';
import { sfx } from '../game/sfx';
import { levelForXp } from '../meta/Progression';
import { loadSave, persistSave, type SaveData } from '../meta/SaveGame';
import { buyUpgrade, unlockedCars } from '../meta/Unlocks';
import { bodyStyle, clearScene, fitToScreen, isNarrow, makeButton, makePanel, titleStyle } from '../ui/widgets';

/** The modernized Nitro pit stop: cars, upgrades, cosmetics. */
export class GarageScene extends Phaser.Scene {
  private save!: SaveData;

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
    fitToScreen(this, start, narrow ? 420 : 960, narrow ? 1020 : 600);
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

    this.add.text(650, 100, 'FUEL TYPE — sets shape, color & trail', titleStyle(15, hexToCss(PALETTE.uiText)));
    this.buildFuels(790, 150, 52, 280);

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

    const fuelTop = upTop + 32 + UPGRADES.length * 60 + 30;
    this.add.text(24, fuelTop - 18, 'FUEL TYPE — sets shape, color & trail', titleStyle(14, hexToCss(PALETTE.uiText)));
    this.buildFuels(210, fuelTop + 26, 46, 384);

    makeButton(this, 210, fuelTop + 26 + FUELS.length * 46 + 28, 300, 46, '← BACK TO MENU', () => this.scene.start('menu'));
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
    img.setTint(owned ? fuelById(this.save.selectedFuel).color : 0x333a4a);

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

}
