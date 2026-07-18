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
    controlPoints: [
      { x: 800, y: 900 },
      { x: 1900, y: 620 },
      { x: 3000, y: 700 },
      { x: 3600, y: 1250 },
      { x: 3350, y: 1950 },
      { x: 3650, y: 2650 },
      { x: 3150, y: 3350 },
      { x: 2200, y: 3150 },
      { x: 1500, y: 3600 },
      { x: 750, y: 3150 },
      { x: 550, y: 2100 },
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
    // Winding rally loop with tighter corners than the city GP.
    controlPoints: [
      { x: 700, y: 700 },
      { x: 1700, y: 950 },
      { x: 2500, y: 600 },
      { x: 3500, y: 900 },
      { x: 3300, y: 1700 },
      { x: 3650, y: 2400 },
      { x: 3100, y: 3000 },
      { x: 3350, y: 3600 },
      { x: 2300, y: 3450 },
      { x: 1600, y: 3000 },
      { x: 950, y: 3550 },
      { x: 520, y: 2700 },
      { x: 1000, y: 1900 },
      { x: 600, y: 1300 },
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
