import type { LevelDef } from "./types";
import { world1 } from "./world1";
import { world2 } from "./world2";
import { world3 } from "./world3";
import { world4 } from "./world4";
import { world5 } from "./world5";

export const LEVELS: LevelDef[] = [...world1, ...world2, ...world3, ...world4, ...world5];

export function levelById(id: string): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}

export function levelsOfWorld(world: number): LevelDef[] {
  return LEVELS.filter((l) => l.world === world);
}

export function nextLevel(id: string): LevelDef | undefined {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i >= 0 ? LEVELS[i + 1] : undefined;
}
