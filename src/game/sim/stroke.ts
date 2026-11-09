import { VIEW_H, VIEW_W, TUNING } from "../core/config";
import {
  dist,
  lerpVec,
  pointInPolygon,
  pointSegmentDistance,
  polylineLength,
  segmentPolygonDistance,
  segmentSegmentDistance,
  simplify,
  type Vec,
} from "../core/math";

/** Everything a stroke may not pass through, captured while the scene is frozen. */
export interface Obstacles {
  polys: Vec[][];
  circles: Array<{ x: number; y: number; r: number }>;
  /** Existing ink polylines (world space). */
  lines: Vec[][];
  /** Areas where drawing is forbidden but bodies may pass. */
  zones: Vec[][];
}

const CLEARANCE = 2;

export function capsuleFree(a: Vec, b: Vec, obstacles: Obstacles, radius = TUNING.inkRadius): boolean {
  const r = radius + CLEARANCE;
  if (a.x < r || a.x > VIEW_W - r || b.x < r || b.x > VIEW_W - r) return false;
  if (a.y < r || b.y < r || a.y > VIEW_H - r || b.y > VIEW_H - r) return false;
  for (const c of obstacles.circles) {
    if (pointSegmentDistance(c, a, b) < c.r + r) return false;
  }
  for (const poly of obstacles.polys) {
    if (segmentPolygonDistance(a, b, poly) < r) return false;
  }
  for (const zone of obstacles.zones) {
    if (segmentPolygonDistance(a, b, zone) < 1) return false;
  }
  for (const line of obstacles.lines) {
    for (let i = 1; i < line.length; i++) {
      if (segmentSegmentDistance(a, b, line[i - 1]!, line[i]!) < r * 2) return false;
    }
  }
  return true;
}

function pointFree(p: Vec, obstacles: Obstacles): boolean {
  if (!capsuleFree(p, p, obstacles)) return false;
  for (const zone of obstacles.zones) if (pointInPolygon(p, zone)) return false;
  return true;
}

/**
 * Turns raw pointer samples into a valid stroke: it stops at obstacles (like a pen meeting a wall),
 * resumes when the pointer finds a clear straight path again, and never exceeds the ink budget.
 */
export class StrokeBuilder {
  readonly points: Vec[] = [];
  length = 0;
  /** True while the pointer is somewhere the ink cannot reach. */
  blocked = false;
  /** Where the pointer actually is (for drawing the red "blocked" hint). */
  cursor: Vec | undefined;

  constructor(
    private readonly obstacles: Obstacles,
    readonly budget: number,
  ) {}

  get remaining(): number {
    return Math.max(0, this.budget - this.length);
  }

  get empty(): boolean {
    return this.remaining <= 0.5;
  }

  start(p: Vec): boolean {
    this.cursor = p;
    if (!pointFree(p, this.obstacles) || this.budget <= 0) {
      this.blocked = true;
      return false;
    }
    this.points.push({ x: p.x, y: p.y });
    this.blocked = false;
    return true;
  }

  get started(): boolean {
    return this.points.length > 0;
  }

  extend(p: Vec): void {
    this.cursor = p;
    if (!this.started) {
      this.start(p);
      return;
    }
    if (this.empty) return;
    const last = this.points[this.points.length - 1]!;
    let d = dist(last, p);
    if (d < TUNING.strokeSampleSpacing) return;

    let target = p;
    if (d > this.remaining) {
      target = lerpVec(last, p, this.remaining / d);
      d = this.remaining;
    }

    if (capsuleFree(last, target, this.obstacles)) {
      this.push(target);
      this.blocked = false;
      return;
    }

    // Walk as far as possible toward the pointer, then stop at the obstacle.
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (capsuleFree(last, lerpVec(last, target, mid), this.obstacles)) lo = mid;
      else hi = mid;
    }
    const reach = lerpVec(last, target, lo);
    if (dist(last, reach) >= 2) this.push(reach);
    this.blocked = true;
  }

  private push(p: Vec): void {
    const last = this.points[this.points.length - 1]!;
    this.length += dist(last, p);
    this.points.push({ x: p.x, y: p.y });
  }

  /** Returns the simplified stroke, or null if it is too short to count. */
  finish(): Vec[] | null {
    if (this.points.length < 2 || this.length < TUNING.minStrokeLength) return null;
    return simplify(this.points, TUNING.strokeSimplifyEpsilon);
  }
}

/** Validates a pre-authored stroke (hints, tests) exactly as live input would. */
export function replayStroke(points: readonly Vec[], obstacles: Obstacles, budget: number): { points: Vec[] | null; clipped: boolean } {
  const builder = new StrokeBuilder(obstacles, budget);
  let clipped = false;
  for (const pt of points) {
    builder.extend(pt);
    if (builder.blocked || builder.empty) clipped = true;
  }
  return { points: builder.finish(), clipped: clipped && builder.length < polylineLength(points) - 4 };
}
