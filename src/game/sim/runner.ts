import type { Vec } from "../core/math";
import type { LevelDef } from "../levels/types";
import { Sim, type SimOptions } from "./Sim";
import { replayStroke } from "./stroke";
import type { Outcome } from "./types";

export interface RunResult {
  outcome: Outcome | undefined;
  clipped: boolean;
  steps: number;
  stings: number;
}

/** Plays a level headlessly with the given strokes, exactly as a player would draw them. */
export function runLevel(level: LevelDef, strokes: readonly Vec[][], options: SimOptions = {}, extraSeconds = 0.2): RunResult {
  const sim = new Sim(level, options);
  let clipped = false;
  for (const stroke of strokes) {
    if (sim.phase !== "plan") break;
    const result = replayStroke(stroke, sim.obstacles(), sim.inkLeft);
    clipped ||= result.clipped;
    if (result.points) sim.commitStroke(result.points);
  }
  sim.release();
  let steps = 0;
  let stings = 0;
  const limit = Math.ceil((sim.duration + extraSeconds + 1) * 60);
  while (steps < limit && (sim.phase === "survive" || (sim.phase !== "plan" && sim.endT < extraSeconds))) {
    sim.step();
    steps++;
    for (const ev of sim.drainEvents()) if (ev.type === "sting" || ev.type === "hurt") stings++;
  }
  const outcome = sim.outcome;
  sim.dispose();
  return { outcome, clipped, steps, stings };
}
