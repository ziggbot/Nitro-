/**
 * Drivetrain/fuel types — the visual identity of every car's trail and
 * exhaust, selectable before a run. Trail + exhaust styling per type:
 *  - petrol: orange fire trail, flame-spray exhaust
 *  - gas: yellow jet-flame exhaust with a smoke streak trail
 *  - electric: blue crackling trail that flickers, spark-burst exhaust
 */
export interface FuelDef {
  id: 'petrol' | 'gas' | 'electric';
  name: string;
  emoji: string;
  /** Car body sprite — every fuel type has its own silhouette. */
  texture: string;
  /** Signature body color — every fuel type has its own paint. */
  color: number;
  /** Trail gradient, head → tail. */
  trailColors: number[];
  /** Exhaust particle tints. */
  exhaustTints: number[];
  /** Rocket plume + smoke streak (gas). */
  smoke: boolean;
  /** Electric flicker: trail alpha crackles, exhaust is short sharp sparks. */
  flicker: boolean;
}

export const FUELS: FuelDef[] = [
  {
    id: 'petrol',
    name: 'Petrol',
    emoji: '⛽',
    texture: 'car-sports',
    color: 0xff7a28, // hot-rod orange
    trailColors: [0xfff2c0, 0xffb020, 0xff5a1f],
    exhaustTints: [0xfff6c0, 0xffd020, 0xff8a1f, 0xff3b18],
    smoke: false,
    flicker: false,
  },
  {
    id: 'gas',
    name: 'Gas',
    emoji: '🔥',
    texture: 'car-rocket',
    color: 0xffd435, // rocket yellow
    trailColors: [0xfffbe0, 0xffe040, 0xd09a20],
    // Rocket plume: white-blue core out to yellow.
    exhaustTints: [0xffffff, 0xd0e8ff, 0xfff0a0, 0xffd040],
    smoke: true,
    flicker: false,
  },
  {
    id: 'electric',
    name: 'Electric',
    emoji: '⚡',
    texture: 'car-electric',
    color: 0x38c8ff, // EV ice blue
    trailColors: [0xe8feff, 0x00f0ff, 0x2050ff],
    exhaustTints: [0xffffff, 0x80f8ff, 0x4060ff],
    smoke: false,
    flicker: true,
  },
];

export function fuelById(id: string): FuelDef {
  return FUELS.find((f) => f.id === id) ?? FUELS[0];
}

export function randomFuel(): FuelDef {
  return FUELS[Math.floor(Math.random() * FUELS.length)];
}
