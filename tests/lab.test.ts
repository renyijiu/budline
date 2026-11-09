import { test } from "vitest";

import type { Vec } from "../src/game/core/math";
import { LEVELS } from "../src/game/levels";
import { naiveAttempts } from "./naive";
import { runLevel } from "../src/game/sim/runner";

const shift = (strokes: Vec[][], dx: number, dy: number): Vec[][] => strokes.map((s) => s.map((p) => ({ x: p.x + dx, y: p.y + dy })));

/**
 * Level-design aid, skipped by default: `LAB=2- pnpm vitest run tests/lab.test.ts --silent=false --reporter=verbose`
 * prints, per level, how the reference solution, no stroke and a "newbie dome" fare.
 */
test.skipIf(process.env.LAB === undefined)("lab", () => {
  const pattern = process.env.LAB ?? "";
  for (const level of LEVELS.filter((l) => l.id.startsWith(pattern))) {
    const sol = runLevel(level, level.solution);
    const none = runLevel(level, []);
    const jit = [
      [5, 0],
      [-5, 0],
      [0, -5],
    ].map(([dx, dy]) => runLevel(level, shift(level.solution, dx!, dy!)).outcome?.won ? "w" : "l").join("");
    // "Newbie" domes: if any of these win, the level has no real puzzle.
    const naive = naiveAttempts(level)
      .map((a) => {
        const r = runLevel(level, a.strokes);
        return `${a.name}:${r.outcome?.won ? "WIN" : (r.outcome?.reason ?? "?")}`;
      })
      .join(" ");
    console.log(
      `${level.id} sol:${sol.outcome?.won ? `WIN*${sol.outcome.stars}` : `LOSE(${sol.outcome?.reason}@${(sol.steps / 60).toFixed(1)})`} ink:${sol.outcome?.inkUsed}/${level.par}/${level.ink} stings:${sol.stings} clip:${sol.clipped} jitter:${jit} | none:${none.outcome?.won ? "WIN!!" : `lose(${none.outcome?.reason})@${(none.steps / 60).toFixed(1)}s`} | ${level.naiveOk ? "(naive ok) " : ""}${naive}`,
    );
  }
});
