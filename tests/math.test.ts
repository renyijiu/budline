import { describe, expect, test } from "vitest";

import { pointInPolygon, pointSegmentDistance, polylineLength, segmentPolygonDistance, segmentsIntersect, simplify } from "../src/game/core/math";
import { Rng } from "../src/game/core/rng";

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

describe("geometry", () => {
  test("point-segment distance clamps to the endpoints", () => {
    expect(pointSegmentDistance({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(3);
    expect(pointSegmentDistance({ x: -3, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(5);
  });

  test("segment intersection ignores touching-free parallels", () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true);
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }, { x: 10, y: 1 })).toBe(false);
  });

  test("polygon containment and distance", () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
    expect(segmentPolygonDistance({ x: 15, y: -5 }, { x: 15, y: 15 }, square)).toBeCloseTo(5);
    expect(segmentPolygonDistance({ x: -5, y: 5 }, { x: 15, y: 5 }, square)).toBe(0);
  });

  test("simplify keeps corners and drops collinear points", () => {
    const line = [
      { x: 0, y: 0 },
      { x: 5, y: 0.2 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    const out = simplify(line, 1);
    expect(out).toEqual([line[0], line[2], line[3]]);
    expect(polylineLength(out)).toBeCloseTo(20);
  });
});

describe("rng", () => {
  test("is deterministic per seed", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
