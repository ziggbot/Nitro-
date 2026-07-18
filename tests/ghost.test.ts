import { describe, expect, it } from 'vitest';
import { GhostRecorder, GhostPlayer, encodeGhost, decodeGhost, SAMPLE_MS } from '../src/game/ghost';

function fakeRace(): ReturnType<GhostRecorder['toData']> {
  const rec = new GhostRecorder();
  // Simulate a car driving a curve for 60 seconds at ~60fps.
  for (let t = 0; t <= 60_000; t += 16) {
    const a = t / 4000;
    rec.record(t, 2000 + Math.cos(a) * 900, 2000 + Math.sin(a) * 900, a + Math.PI / 2);
  }
  return rec.toData('TestDriver', 'city-gp', 61_234);
}

describe('ghost recording', () => {
  it('samples uniformly at SAMPLE_MS', () => {
    const data = fakeRace();
    expect(data.samples.length).toBe(Math.floor(60_000 / SAMPLE_MS) + 1);
  });

  it('round-trips through encode/decode within quantization error', () => {
    const data = fakeRace();
    const encoded = encodeGhost(data);
    expect(typeof encoded).toBe('string');
    // URL-safe alphabet only.
    expect(/^[A-Za-z0-9_-]+$/.test(encoded)).toBe(true);
    const decoded = decodeGhost(encoded)!;
    expect(decoded).not.toBeNull();
    expect(decoded.name).toBe('TestDriver');
    expect(decoded.trackId).toBe('city-gp');
    expect(decoded.timeMs).toBe(61_234);
    expect(decoded.samples.length).toBe(data.samples.length);
    // Positions within a few px (2px quantization + delta rounding drift).
    for (let i = 0; i < data.samples.length; i += 25) {
      expect(Math.abs(decoded.samples[i].x - data.samples[i].x)).toBeLessThan(8);
      expect(Math.abs(decoded.samples[i].y - data.samples[i].y)).toBeLessThan(8);
    }
  });

  it('stays compact enough for a share link', () => {
    // 3-minute race should fit comfortably in a URL fragment.
    const rec = new GhostRecorder();
    for (let t = 0; t <= 180_000; t += 16) {
      rec.record(t, 2000 + (t % 4000) / 2, 2000, 1);
    }
    const encoded = encodeGhost(rec.toData('LongRacer', 'city-gp', 180_000));
    expect(encoded.length).toBeLessThan(6000);
  });

  it('playback interpolates between samples', () => {
    const data = fakeRace();
    const player = new GhostPlayer(data);
    const a = player.at(1000);
    const b = player.at(1100);
    const c = player.at(1200);
    // Midpoint sits between the neighbors.
    expect(Math.min(a.x, c.x) - 1).toBeLessThanOrEqual(b.x);
    expect(Math.max(a.x, c.x) + 1).toBeGreaterThanOrEqual(b.x);
    // Clamps beyond the end.
    const end = player.at(10_000_000);
    expect(end.x).toBe(data.samples[data.samples.length - 1].x);
  });

  it('rejects garbage input', () => {
    expect(decodeGhost('not-a-ghost')).toBeNull();
    expect(decodeGhost('')).toBeNull();
  });
});
