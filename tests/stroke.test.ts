import { describe, expect, test } from "vitest";

import { StrokeBuilder, type Obstacles } from "../src/game/sim/stroke";

const wall: Obstacles = {
  polys: [
    [
      { x: 300, y: 0 },
      { x: 340, y: 0 },
      { x: 340, y: 600 },
      { x: 300, y: 600 },
    ],
  ],
  circles: [{ x: 500, y: 900, r: 40 }],
  lines: [],
  zones: [],
};

describe("StrokeBuilder", () => {
  test("refuses to start inside an obstacle", () => {
    const b = new StrokeBuilder(wall, 1000);
    expect(b.start({ x: 320, y: 300 })).toBe(false);
    expect(b.blocked).toBe(true);
    expect(b.start({ x: 100, y: 300 })).toBe(true);
  });

  test("stops at a wall like a pen, then resumes along a clear path", () => {
    const b = new StrokeBuilder(wall, 2000);
    b.start({ x: 100, y: 300 });
    b.extend({ x: 400, y: 300 });
    expect(b.blocked).toBe(true);
    const last = b.points[b.points.length - 1]!;
    expect(last.x).toBeLessThan(300 - 7);
    expect(last.x).toBeGreaterThan(270);
    // Going around the bottom of the wall is allowed again.
    b.extend({ x: 280, y: 700 });
    expect(b.blocked).toBe(false);
  });

  test("never draws more ink than the budget", () => {
    const b = new StrokeBuilder(wall, 120);
    b.start({ x: 50, y: 800 });
    for (let x = 60; x <= 290; x += 10) b.extend({ x, y: 800 });
    expect(b.length).toBeLessThanOrEqual(120 + 1e-6);
    expect(b.empty).toBe(true);
  });

  test("rejects taps that are too short to be a stroke", () => {
    const b = new StrokeBuilder(wall, 500);
    b.start({ x: 50, y: 800 });
    b.extend({ x: 60, y: 800 });
    expect(b.finish()).toBeNull();
  });

  test("keeps clear of round obstacles such as pets", () => {
    const b = new StrokeBuilder(wall, 1000);
    b.start({ x: 400, y: 900 });
    b.extend({ x: 600, y: 900 });
    const last = b.points[b.points.length - 1]!;
    expect(last.x).toBeLessThan(500 - 40 - 7);
  });
});
