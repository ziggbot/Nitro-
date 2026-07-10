/**
 * The single source of truth for the game's synthwave color scheme.
 * Every sprite, texture and UI element pulls from here so the whole
 * game stays on one consistent palette.
 */
export const PALETTE = {
  // Core neon accents
  cyan: 0x00f0ff,
  magenta: 0xff2ec4,
  amber: 0xffb020,
  lime: 0xa8ff3e,
  red: 0xff3b3b,
  violet: 0x9d4dff,

  // UI
  uiText: 0xeaf6ff,
  uiDim: 0x8a9bb8,
  uiPanel: 0x101828,
  uiPanelStroke: 0x2c3e5f,
  gold: 0xffd166,

  // Backgrounds
  deepSpace: 0x0a0a14,
} as const;

/** Per-environment look: floor tones, grid line color, ambient accents. */
export interface EnvPalette {
  floorBase: number;
  floorDetail: number;
  grid: number;
  wall: number;
  ambient: number; // decorative accent color
}

export const ENV_PALETTES: Record<string, EnvPalette> = {
  city: {
    floorBase: 0x14142a,
    floorDetail: 0x1c1c38,
    grid: 0x28285a,
    wall: 0x00f0ff,
    ambient: 0x3a3a7a,
  },
  forest: {
    floorBase: 0x0e2016,
    floorDetail: 0x143022,
    grid: 0x1e4a30,
    wall: 0xa8ff3e,
    ambient: 0x2a6a3a,
  },
  desert: {
    floorBase: 0x2a1c10,
    floorDetail: 0x3a2a16,
    grid: 0x5a4020,
    wall: 0xffb020,
    ambient: 0x7a5a2a,
  },
  wasteland: {
    floorBase: 0x1c1024,
    floorDetail: 0x2a1834,
    grid: 0x44205a,
    wall: 0xff2ec4,
    ambient: 0x6a2a7a,
  },
};

export function hexToCss(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}
