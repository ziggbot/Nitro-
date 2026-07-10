/**
 * Data-driven arena/level definitions. `type` and `waypoints` exist so a
 * future Racing Tournament mode (type: 'track', ordered checkpoints) plugs
 * into the same data without a rewrite.
 */
export interface ArenaDef {
  id: string;
  name: string;
  type: 'arena' | 'track';
  envId: 'city' | 'forest' | 'desert' | 'wasteland';
  size: number; // square world, px
  /** Trophies required to unlock. */
  unlockTrophies: number;
  /** Night variant: headlight-only visibility, double rewards. */
  night: boolean;
  rewardMult: number;
  orbCount: number;
  botCount: number;
  hazards: { oil: number; cones: number; potholes: number };
  /** Reserved for tournament mode: ordered checkpoint list. */
  waypoints?: { x: number; y: number }[];
}

export const ARENAS: ArenaDef[] = [
  {
    id: 'city-day',
    name: 'City Streets',
    type: 'arena',
    envId: 'city',
    size: 4000,
    unlockTrophies: 0,
    night: false,
    rewardMult: 1,
    orbCount: 380,
    botCount: 15,
    hazards: { oil: 6, cones: 14, potholes: 5 },
  },
  {
    id: 'forest-day',
    name: 'Forest Trails',
    type: 'arena',
    envId: 'forest',
    size: 4200,
    unlockTrophies: 6,
    night: false,
    rewardMult: 1.2,
    orbCount: 360,
    botCount: 15,
    hazards: { oil: 8, cones: 10, potholes: 10 },
  },
  {
    id: 'desert-day',
    name: 'Desert Dunes',
    type: 'arena',
    envId: 'desert',
    size: 4400,
    unlockTrophies: 14,
    night: false,
    rewardMult: 1.4,
    orbCount: 340,
    botCount: 16,
    hazards: { oil: 5, cones: 8, potholes: 16 },
  },
  {
    id: 'city-night',
    name: 'City Streets — Night',
    type: 'arena',
    envId: 'city',
    size: 4000,
    unlockTrophies: 20,
    night: true,
    rewardMult: 2,
    orbCount: 380,
    botCount: 14,
    hazards: { oil: 8, cones: 14, potholes: 6 },
  },
  {
    id: 'wasteland-day',
    name: 'Toxic Wasteland',
    type: 'arena',
    envId: 'wasteland',
    size: 4600,
    unlockTrophies: 28,
    night: false,
    rewardMult: 1.7,
    orbCount: 320,
    botCount: 17,
    hazards: { oil: 12, cones: 6, potholes: 14 },
  },
  {
    id: 'wasteland-night',
    name: 'Wasteland — Night',
    type: 'arena',
    envId: 'wasteland',
    size: 4600,
    unlockTrophies: 40,
    night: true,
    rewardMult: 2.5,
    orbCount: 320,
    botCount: 16,
    hazards: { oil: 14, cones: 6, potholes: 16 },
  },
];

export function arenaById(id: string): ArenaDef {
  return ARENAS.find((a) => a.id === id) ?? ARENAS[0];
}
