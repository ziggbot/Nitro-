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
    .on('pointerdown', () => {
      if (!enabled) return;
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

export function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
