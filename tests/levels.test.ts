import { describe, expect, test } from "vitest";

import type { Vec } from "../src/game/core/math";
import { LEVELS } from "../src/game/levels";
import { runLevel } from "../src/game/sim/runner";
import { naiveAttempts } from "./naive";

const shift = (strokes: Vec[][], dx: number, dy: number): Vec[][] => strokes.map((s) => s.map((p) => ({ x: p.x + dx, y: p.y + dy })));


describe("campaign levels", () => {
  test("ids are unique and ordered", () => {
    const ids = LEVELS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of LEVELS) expect(l.id).toBe(`${l.world}-${l.index}`);
  });

  for (const level of LEVELS) {
    describe(`${level.id} ${level.name}`, () => {
      test("reference solution is drawable, wins, and earns every star", () => {
        const result = runLevel(level, level.solution);
        expect(result.clipped, "solution stroke hits an obstacle or runs out of ink").toBe(false);
        expect(result.outcome?.won, `solution lost: ${result.outcome?.reason}`).toBe(true);
        expect(result.outcome?.stars).toBe(3);
      });

      test("doing nothing loses", () => {
        const result = runLevel(level, []);
        expect(result.outcome?.won).toBe(false);
      });

      test.skipIf(level.naiveOk === true)("a plain dome is not enough", () => {
        const winners = naiveAttempts(level)
          .filter((attempt) => runLevel(level, attempt.strokes).outcome?.won)
          .map((attempt) => attempt.name);
        expect(winners, "this level can be beaten without understanding its twist").toEqual([]);
      });

      for (const pitfall of level.pitfalls ?? []) {
        test(`pitfall loses: ${pitfall.name}`, () => {
          expect(runLevel(level, pitfall.strokes).outcome?.won).toBe(false);
        });
      }

      test("solution tolerates a slightly shaky hand", () => {
        let wins = 0;
        const offsets: Array<[number, number]> = [
          [5, 0],
          [-5, 0],
          [0, -5],
        ];
        for (const [dx, dy] of offsets) if (runLevel(level, shift(level.solution, dx, dy)).outcome?.won) wins++;
        expect(wins, "solution only works when drawn pixel-perfect").toBeGreaterThanOrEqual(2);
      });
    });
  }
});
