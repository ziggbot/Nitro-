/**
 * Ghost racing — the simplest friend-vs-friend multiplayer that works on
 * a static host: record a race, encode it into a share link, and the
 * friend races the ghost. Pure logic, unit-tested.
 *
 * Wire format (base64url of bytes):
 * [ver][nameLen][name utf8][trackLen][trackId utf8][timeMs u32]
 * [startX u16][startY u16][startHeading u8][sampleCount u16]
 * [(dx i8, dy i8, dh i8) × count]
 * Positions quantized to 2px, headings to 256ths of a turn, samples
 * taken every SAMPLE_MS. Deltas clamp to ±127 (≈254px per tick — above
 * any legal speed, so clamping never matters in practice).
 */

export const SAMPLE_MS = 200;

export interface GhostSample {
  x: number;
  y: number;
  heading: number;
}

export interface GhostData {
  name: string;
  trackId: string;
  timeMs: number;
  samples: GhostSample[];
}

export class GhostRecorder {
  samples: GhostSample[] = [];

  /** Call every frame; keeps samples uniformly SAMPLE_MS apart. */
  record(raceTimeMs: number, x: number, y: number, heading: number): void {
    while (this.samples.length * SAMPLE_MS <= raceTimeMs) {
      this.samples.push({ x, y, heading });
    }
  }

  toData(name: string, trackId: string, timeMs: number): GhostData {
    return { name, trackId, timeMs, samples: this.samples };
  }
}

/** Interpolated playback of a recorded ghost. */
export class GhostPlayer {
  constructor(private data: GhostData) {}

  /** Position at a race time; clamps to the final sample after finish. */
  at(raceTimeMs: number): GhostSample {
    const s = this.data.samples;
    if (s.length === 0) return { x: 0, y: 0, heading: 0 };
    const f = raceTimeMs / SAMPLE_MS;
    const i = Math.min(s.length - 1, Math.max(0, Math.floor(f)));
    const j = Math.min(s.length - 1, i + 1);
    const t = Math.min(1, Math.max(0, f - i));
    const a = s[i];
    const b = s[j];
    let dh = b.heading - a.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      heading: a.heading + dh * t,
    };
  }
}

const TWO_PI = Math.PI * 2;

function clampI8(v: number): number {
  return Math.max(-127, Math.min(127, Math.round(v)));
}

export function encodeGhost(data: GhostData): string {
  const nameBytes = new TextEncoder().encode(data.name.slice(0, 24));
  const trackBytes = new TextEncoder().encode(data.trackId.slice(0, 32));
  const n = Math.min(data.samples.length, 65535);
  const bytes = new Uint8Array(1 + 1 + nameBytes.length + 1 + trackBytes.length + 4 + 2 + 2 + 1 + 2 + n * 3);
  let o = 0;
  bytes[o++] = 1; // version
  bytes[o++] = nameBytes.length;
  bytes.set(nameBytes, o);
  o += nameBytes.length;
  bytes[o++] = trackBytes.length;
  bytes.set(trackBytes, o);
  o += trackBytes.length;
  const view = new DataView(bytes.buffer);
  view.setUint32(o, Math.round(data.timeMs));
  o += 4;

  const first = data.samples[0] ?? { x: 0, y: 0, heading: 0 };
  let qx = Math.round(first.x / 2);
  let qy = Math.round(first.y / 2);
  let qh = Math.round(((first.heading % TWO_PI) + TWO_PI) % TWO_PI * (256 / TWO_PI)) & 0xff;
  view.setUint16(o, qx);
  o += 2;
  view.setUint16(o, qy);
  o += 2;
  bytes[o++] = qh;
  view.setUint16(o, n);
  o += 2;

  for (let i = 0; i < n; i++) {
    const s = data.samples[i];
    const nx = Math.round(s.x / 2);
    const ny = Math.round(s.y / 2);
    const nh = Math.round(((s.heading % TWO_PI) + TWO_PI) % TWO_PI * (256 / TWO_PI)) & 0xff;
    const dx = clampI8(nx - qx);
    const dy = clampI8(ny - qy);
    let dh = nh - qh;
    if (dh > 128) dh -= 256;
    if (dh < -128) dh += 256;
    bytes[o++] = dx & 0xff;
    bytes[o++] = dy & 0xff;
    bytes[o++] = clampI8(dh) & 0xff;
    qx += dx;
    qy += dy;
    qh = (qh + dh + 256) % 256;
  }

  // base64url without padding.
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeGhost(encoded: string): GhostData | null {
  try {
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    let o = 0;
    if (bytes[o++] !== 1) return null;
    const nameLen = bytes[o++];
    const name = new TextDecoder().decode(bytes.slice(o, o + nameLen));
    o += nameLen;
    const trackLen = bytes[o++];
    const trackId = new TextDecoder().decode(bytes.slice(o, o + trackLen));
    o += trackLen;
    const view = new DataView(bytes.buffer);
    const timeMs = view.getUint32(o);
    o += 4;
    let qx = view.getUint16(o);
    o += 2;
    let qy = view.getUint16(o);
    o += 2;
    let qh = bytes[o++];
    const n = view.getUint16(o);
    o += 2;

    const samples: GhostSample[] = [];
    for (let i = 0; i < n; i++) {
      const dx = (bytes[o++] << 24) >> 24;
      const dy = (bytes[o++] << 24) >> 24;
      const dh = (bytes[o++] << 24) >> 24;
      qx += dx;
      qy += dy;
      qh = (qh + dh + 256) % 256;
      samples.push({ x: qx * 2, y: qy * 2, heading: (qh / 256) * TWO_PI });
    }
    if (samples.length === 0) return null;
    return { name, trackId, timeMs, samples };
  } catch {
    return null;
  }
}
