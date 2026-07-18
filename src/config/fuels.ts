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
  /** Trail gradient, head → tail. */
  trailColors: number[];
  /** Exhaust particle tints. */
  exhaustTints: number[];
  /** Gray smoke: wide smoke underlay on the trail + smoke puffs behind. */
  smoke: boolean;
  /** Electric flicker: trail alpha crackles, exhaust is short sharp sparks. */
  flicker: boolean;
}

export const FUELS: FuelDef[] = [
  {
    id: 'petrol',
    name: 'Petrol',
    emoji: '⛽',
    trailColors: [0xfff2c0, 0xffb020, 0xff5a1f],
    exhaustTints: [0xfff6c0, 0xffd020, 0xff8a1f, 0xff3b18],
    smoke: false,
    flicker: false,
  },
  {
    id: 'gas',
    name: 'Gas',
    emoji: '🔥',
    trailColors: [0xfffbe0, 0xffe040, 0xd09a20],
    exhaustTints: [0xfff8d0, 0xffe860, 0xffc020],
    smoke: true,
    flicker: false,
  },
  {
    id: 'electric',
    name: 'Electric',
    emoji: '⚡',
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
