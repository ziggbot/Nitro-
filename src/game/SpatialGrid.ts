/**
 * Uniform grid for fast neighborhood queries over many points
 * (trail segments, orbs). Rebuilt or maintained per frame by the arena.
 */
export interface GridPoint {
  x: number;
  y: number;
  /** Owning entity id (e.g. car id for trail points, orb id). */
  owner: number;
  /** Arbitrary payload index (e.g. trail point index or orb slot). */
  data: number;
}

export class SpatialGrid {
  private cells = new Map<number, GridPoint[]>();

  constructor(private cellSize: number) {}

  private key(cx: number, cy: number): number {
    // Offset so negative coords stay unique; arenas are positive anyway.
    return (cx + 1024) * 65536 + (cy + 1024);
  }

  clear(): void {
    this.cells.clear();
  }

  insert(p: GridPoint): void {
    const k = this.key(Math.floor(p.x / this.cellSize), Math.floor(p.y / this.cellSize));
    const arr = this.cells.get(k);
    if (arr) arr.push(p);
    else this.cells.set(k, [p]);
  }

  remove(p: GridPoint): void {
    const k = this.key(Math.floor(p.x / this.cellSize), Math.floor(p.y / this.cellSize));
    const arr = this.cells.get(k);
    if (!arr) return;
    const i = arr.indexOf(p);
    if (i >= 0) arr.splice(i, 1);
  }

  /** Visit all points within `radius` of (x, y). Return true from cb to stop early. */
  query(x: number, y: number, radius: number, cb: (p: GridPoint) => boolean | void): void {
    const r2 = radius * radius;
    const minCx = Math.floor((x - radius) / this.cellSize);
    const maxCx = Math.floor((x + radius) / this.cellSize);
    const minCy = Math.floor((y - radius) / this.cellSize);
    const maxCy = Math.floor((y + radius) / this.cellSize);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const p = arr[i];
          const dx = p.x - x;
          const dy = p.y - y;
          if (dx * dx + dy * dy <= r2) {
            if (cb(p)) return;
          }
        }
      }
    }
  }

  /** Nearest point to (x, y) within maxRadius, optionally filtered. */
  nearest(
    x: number,
    y: number,
    maxRadius: number,
    filter?: (p: GridPoint) => boolean,
  ): GridPoint | null {
    let best: GridPoint | null = null;
    let bestD2 = maxRadius * maxRadius;
    this.query(x, y, maxRadius, (p) => {
      if (filter && !filter(p)) return;
      const dx = p.x - x;
      const dy = p.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = p;
      }
    });
    return best;
  }
}
