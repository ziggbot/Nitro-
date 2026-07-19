/** Race tracks for the retro Nitro race mode. */
export interface TrackDef {
  id: string;
  name: string;
  envId: 'city' | 'forest' | 'desert' | 'wasteland';
  size: number; // world square, px
  laps: number;
  botCount: number;
  /** Bright daylight look (original city style) vs synthwave night. */
  daylight: boolean;
  /** Closed-loop control points, smoothed into the centerline spline. */
  controlPoints: { x: number; y: number }[];
  roadWidth: number;
  rewardMult: number;
  fuelPickups: number;
  barrels: number;
  hazards: { oil: number; cones: number; potholes: number };
}

export const TRACKS: TrackDef[] = [
  {
    id: 'city-gp',
    name: 'City Grand Prix',
    envId: 'city',
    size: 4200,
    laps: 3,
    botCount: 5,
    daylight: true,
    roadWidth: 170,
    rewardMult: 1,
    fuelPickups: 10,
    barrels: 3,
    hazards: { oil: 4, cones: 8, potholes: 4 },
    // Street circuit: long straights, hard 90° corners, a chicane on the
    // right side and a "bus stop" complex along the bottom.
    controlPoints: [
      { x: 700, y: 650 },
      { x: 2100, y: 550 },
      { x: 3450, y: 650 },
      { x: 3650, y: 1250 },
      { x: 3050, y: 1750 },
      { x: 3600, y: 2300 },
      { x: 3550, y: 3150 },
      { x: 2650, y: 3550 },
      { x: 1850, y: 3050 },
      { x: 1050, y: 3550 },
      { x: 600, y: 2750 },
      { x: 600, y: 1550 },
    ],
  },
  {
    id: 'forest-gp',
    name: 'Forest Rally',
    envId: 'forest',
    size: 4200,
    laps: 3,
    botCount: 5,
    daylight: true,
    roadWidth: 150,
    rewardMult: 1.3,
    fuelPickups: 9,
    barrels: 3,
    hazards: { oil: 6, cones: 4, potholes: 8 },
    // Rally stage: a triple hairpin ladder down the right side, then a
    // slalom home — nothing like the city's straights.
    controlPoints: [
      { x: 700, y: 600 },
      { x: 1900, y: 850 },
      { x: 3000, y: 550 },
      { x: 3600, y: 1150 },
      { x: 2750, y: 1600 },
      { x: 3550, y: 2050 },
      { x: 2700, y: 2500 },
      { x: 3400, y: 3050 },
      { x: 2900, y: 3650 },
      { x: 1950, y: 3300 },
      { x: 1150, y: 3650 },
      { x: 550, y: 2900 },
      { x: 1100, y: 2200 },
      { x: 500, y: 1450 },
    ],
  },
  {
    id: 'desert-gp',
    name: 'Desert Dunes GP',
    envId: 'desert',
    size: 4400,
    laps: 3,
    botCount: 5,
    daylight: true,
    roadWidth: 165,
    rewardMult: 1.5,
    fuelPickups: 8,
    barrels: 3,
    hazards: { oil: 3, cones: 5, potholes: 12 },
    // Flat-out flowing sweepers — few corners, all fast — with a single
    // canyon S-bend across the bottom to punish greed.
    controlPoints: [
      { x: 850, y: 900 },
      { x: 2200, y: 500 },
      { x: 3550, y: 850 },
      { x: 3950, y: 2100 },
      { x: 3500, y: 3250 },
      { x: 2500, y: 3050 },
      { x: 1900, y: 3750 },
      { x: 950, y: 3450 },
      { x: 500, y: 2400 },
      { x: 800, y: 1600 },
    ],
  },
  {
    id: 'wasteland-gp',
    name: 'Toxic Wasteland — Night',
    envId: 'wasteland',
    size: 4400,
    laps: 3,
    botCount: 5,
    daylight: false,
    roadWidth: 160,
    rewardMult: 2,
    fuelPickups: 8,
    barrels: 4,
    hazards: { oil: 10, cones: 4, potholes: 10 },
    // Expert pretzel: a quadruple switchback wall plus jinking return —
    // the most corners per lap of any track.
    controlPoints: [
      { x: 800, y: 700 },
      { x: 2200, y: 520 },
      { x: 3400, y: 800 },
      { x: 3850, y: 1450 },
      { x: 2950, y: 1800 },
      { x: 3750, y: 2350 },
      { x: 2850, y: 2750 },
      { x: 3550, y: 3300 },
      { x: 2450, y: 3700 },
      { x: 1700, y: 3150 },
      { x: 1000, y: 3700 },
      { x: 550, y: 2850 },
      { x: 1150, y: 2250 },
      { x: 500, y: 1500 },
    ],
  },
];

export function trackById(id: string): TrackDef {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[0];
}

/** The race track matching an arena environment (menu RACE button). */
export function trackForEnv(envId: string): TrackDef {
  return TRACKS.find((t) => t.envId === envId) ?? TRACKS[0];
}
