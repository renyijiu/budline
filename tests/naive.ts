import type { Vec } from "../src/game/core/math";
import { arc } from "../src/game/levels/build";
import type { LevelDef } from "../src/game/levels/types";

/**
 * What a first-time player draws: a half-dome over each pet, at a few sizes, plus one big dome over
 * everyone. A level "has a puzzle" when none of these win.
 */
export function naiveAttempts(level: LevelDef): Array<{ name: string; strokes: Vec[][] }> {
  const attempts: Array<{ name: string; strokes: Vec[][] }> = [];
  for (const r of [80, 100, 125]) {
    attempts.push({ name: `dome${r}`, strokes: level.pets.map((pet) => arc(pet.x, pet.y + 26, r, 182, 358, 20)) });
  }
  if (level.pets.length > 1) {
    const xs = level.pets.map((pet) => pet.x);
    const ground = Math.max(...level.pets.map((pet) => pet.y)) + 26;
    const span = Math.max(...xs) - Math.min(...xs);
    attempts.push({ name: "bigDome", strokes: [arc((Math.max(...xs) + Math.min(...xs)) / 2, ground, span / 2 + 100, 182, 358, 36)] });
  }
  return attempts;
}
