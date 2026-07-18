import Phaser from 'phaser';
import { PALETTE, hexToCss } from '../config/palette';
import { sfx } from '../game/sfx';

export const FONTS = {
  title: 'Impact, "Arial Black", sans-serif',
  body: '"Segoe UI", Arial, sans-serif',
  mono: '"Courier New", monospace',
};

export function titleStyle(size: number, color = hexToCss(PALETTE.cyan)): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONTS.title,
    fontSize: `${size}px`,
    color,
    stroke: '#000000',
    strokeThickness: Math.max(2, size / 12),
  };
}

export function bodyStyle(size: number, color = hexToCss(PALETTE.uiText)): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: FONTS.body, fontSize: `${size}px`, color };
}

export function makePanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  alpha = 0.85,
): Phaser.GameObjects.Rectangle {
  const panel = scene.add
    .rectangle(x, y, w, h, PALETTE.uiPanel, alpha)
    .setStrokeStyle(2, PALETTE.uiPanelStroke);
  return panel;
}

export interface ButtonHandle {
  container: Phaser.GameObjects.Container;
  setEnabled(enabled: boolean): void;
  setLabel(text: string): void;
}

export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  onClick: () => void,
  color: number = PALETTE.cyan,
): ButtonHandle {
  const bg = scene.add
    .rectangle(0, 0, w, h, PALETTE.uiPanel, 0.92)
    .setStrokeStyle(2, color);
  const text = scene.add
    .text(0, 0, label, {
      fontFamily: FONTS.title,
      fontSize: `${Math.floor(h * 0.42)}px`,
      color: hexToCss(color),
    })
    .setOrigin(0.5);
  const container = scene.add.container(x, y, [bg, text]);
  container.setSize(w, h);

  let enabled = true;
  bg.setInteractive({ useHandCursor: true })
    .on('pointerover', () => {
      if (enabled) bg.setFillStyle(0x1a2a44, 0.95);
    })
    .on('pointerout', () => bg.setFillStyle(PALETTE.uiPanel, 0.92))
    // Fire on release, not press — plays nicer with touch (no ghost taps
    // while scrolling/panning) and lets the user slide off to cancel.
    .on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (!enabled || pointer.getDistance() > 16) return;
      sfx.click();
      onClick();
    });

  return {
    container,
    setEnabled(on: boolean) {
      enabled = on;
      bg.setStrokeStyle(2, on ? color : 0x445066);
      text.setColor(hexToCss(on ? color : 0x667088));
      container.setAlpha(on ? 1 : 0.6);
    },
    setLabel(t: string) {
      text.setText(t);
    },
  };
}

/** Small ✕ button for in-game HUDs: quit the run and return via results. */
export function makeExitButton(scene: Phaser.Scene, x: number, y: number, onClick: () => void): void {
  const bg = scene.add
    .rectangle(x, y, 32, 32, PALETTE.uiPanel, 0.7)
    .setStrokeStyle(2, PALETTE.red, 0.85)
    .setDepth(60);
  scene.add
    .text(x, y, '✕', { fontFamily: FONTS.body, fontSize: '17px', color: hexToCss(PALETTE.red) })
    .setOrigin(0.5)
    .setDepth(61);
  bg.setInteractive({ useHandCursor: true }).on('pointerup', (pointer: Phaser.Input.Pointer) => {
    if (pointer.getDistance() > 16) return;
    sfx.click();
    onClick();
  });
}

export function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Destroy every display object in the scene. Menus rebuild their whole UI
 * on navigation/resize; merely removing children from the display list
 * leaves their input zones alive, which caused invisible "ghost buttons"
 * layered over the fresh UI on mobile.
 */
export function clearScene(scene: Phaser.Scene): void {
  [...scene.children.list].forEach((obj) => obj.destroy());
}

/** Portrait-ish or small screens get the stacked mobile layout. */
export function isNarrow(scene: Phaser.Scene): boolean {
  return scene.scale.width < 700 || scene.scale.width < scene.scale.height * 0.95;
}

/**
 * Menus are laid out on a fixed design canvas (DW×DH), then everything
 * built after `fromIndex` is wrapped in a container that is scaled and
 * centered to fit the real screen — one code path fits every device.
 */
export function fitToScreen(
  scene: Phaser.Scene,
  fromIndex: number,
  dw: number,
  dh: number,
  maxScale = 1.2,
): Phaser.GameObjects.Container {
  const items = scene.children.list.slice(fromIndex) as Phaser.GameObjects.GameObject[];
  const root = scene.add.container(0, 0);
  root.add(items);
  const s = Math.min(scene.scale.width / dw, scene.scale.height / dh, maxScale);
  root.setScale(s).setPosition((scene.scale.width - dw * s) / 2, (scene.scale.height - dh * s) / 2);
  return root;
}
