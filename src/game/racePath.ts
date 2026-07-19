/**
 * Track centerline geometry: a closed Catmull-Rom spline sampled into
 * points with cumulative distance. Pure math (no Phaser) so lap logic
 * is unit-testable and could run on a server.
 */

export interface PathPoint {
  x: number;
  y: number;
  /** Cumulative distance from the start line along the loop. */
  dist: number;
}

export interface RacePath {
  pts: PathPoint[];
  total: number;
}

/** Sample a closed Catmull-Rom loop through the control points. */
export function buildPath(
  controlPoints: { x: number; y: number }[],
  samplesPerSegment = 18,
): RacePath {
  const n = controlPoints.length;
  const pts: PathPoint[] = [];
  let dist = 0;
  let prev: { x: number; y: number } | null = null;

  for (let seg = 0; seg < n; seg++) {
    const p0 = controlPoints[(seg - 1 + n) % n];
    const p1 = controlPoints[seg];
    const p2 = controlPoints[(seg + 1) % n];
    const p3 = controlPoints[(seg + 2) % n];
    for (let i = 0; i < samplesPerSegment; i++) {
      const t = i / samplesPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      const x =
        0.5 *
        (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const y =
        0.5 *
        (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      if (prev) dist += Math.hypot(x - prev.x, y - prev.y);
      pts.push({ x, y, dist });
      prev = { x, y };
    }
  }
  // Close the loop distance back to the first sample.
  const total = dist + Math.hypot(pts[0].x - prev!.x, pts[0].y - prev!.y);
  return { pts, total };
}

/**
 * Nearest sample index to (x, y), searched in a window around `lastIdx`
 * so cars can't snap across the track to a far segment.
 */
export function nearestIndex(path: RacePath, x: number, y: number, lastIdx: number, window = 60): number {
  const n = path.pts.length;
  let best = lastIdx;
  let bestD2 = Infinity;
  for (let off = -window; off <= window; off++) {
    const i = (lastIdx + off + n) % n;
    const p = path.pts[i];
    const dx = p.x - x;
    const dy = p.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  return best;
}

/** A spot where the track crosses itself: the later section bridges over. */
export interface Crossing {
  x: number;
  y: number;
  /** Sample index of the earlier (under) pass. */
  underIdx: number;
  /** Sample index of the later (over/bridge) pass. */
  overIdx: number;
}

/**
 * Find self-crossings of the centerline (figure-8 tracks). Two samples far
 * apart along the loop but nearly touching in space mark a crossing; the
 * closest such pair per cluster is returned.
 */
export function findCrossings(path: RacePath, roadWidth: number, minIndexGap = 30): Crossing[] {
  const pts = path.pts;
  const n = pts.length;
  const found: (Crossing & { d: number })[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + minIndexGap; j < n; j++) {
      if (Math.min(j - i, n - (j - i)) < minIndexGap) continue;
      const dx = pts[i].x - pts[j].x;
      const dy = pts[i].y - pts[j].y;
      const d = Math.hypot(dx, dy);
      if (d > roadWidth * 0.6) continue;
      const cx = (pts[i].x + pts[j].x) / 2;
      const cy = (pts[i].y + pts[j].y) / 2;
      const cluster = found.find((c) => Math.hypot(c.x - cx, c.y - cy) < roadWidth * 2.5);
      if (!cluster) {
        found.push({ x: cx, y: cy, underIdx: i, overIdx: j, d });
      } else if (d < cluster.d) {
        Object.assign(cluster, { x: cx, y: cy, underIdx: i, overIdx: j, d });
      }
    }
  }
  return found.map(({ d: _d, ...c }) => c);
}

/** Tracks lap count + total progress for one car. */
export class LapTracker {
  idx: number;
  lap = 0;

  constructor(
    private path: RacePath,
    startIdx: number,
  ) {
    this.idx = startIdx;
  }

  /** Update from a new position; returns true when a NEW lap was completed. */
  update(x: number, y: number): boolean {
    const n = this.path.pts.length;
    const newIdx = nearestIndex(this.path, x, y, this.idx);
    const wrapForward = this.idx > n * 0.8 && newIdx < n * 0.2;
    const wrapBackward = newIdx > n * 0.8 && this.idx < n * 0.2;
    if (wrapForward) this.lap++;
    if (wrapBackward) this.lap--; // driving backwards over the line undoes it
    this.idx = newIdx;
    return wrapForward;
  }

  /** Monotonic race progress in px (laps + distance along the loop). */
  get progress(): number {
    return this.lap * this.path.total + this.path.pts[this.idx].dist;
  }

  /** Distance from the point to the centerline (off-road check). */
  distToCenter(x: number, y: number): number {
    const p = this.path.pts[this.idx];
    return Math.hypot(p.x - x, p.y - y);
  }
}
