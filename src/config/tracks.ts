/** Race tracks for the retro Nitro race mode. */
export interface TrackDef {
  id: string;
  name: string;
  envId: 'city' | 'forest' | 'desert' | 'wasteland';
  size: number; // world square, px
  laps: number;
  botCount: number;
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
];

export function trackById(id: string): TrackDef {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[0];
}
