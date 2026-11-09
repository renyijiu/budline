import type { PetKind } from "../game/levels/types";
import type { BoosterId } from "../game/sim/types";

export interface SaveData {
  v: 1;
  stars: Record<string, number>;
  bestInk: Record<string, number>;
  honey: number;
  boosters: Record<BoosterId, number>;
  pets: PetKind[];
  pet: PetKind;
  sound: boolean;
  music: boolean;
  endlessBest: number;
  fails: Record<string, number>;
  hinted: string[];
}

export const SAVE_KEY = "budline-save-v1";

export function defaultSave(): SaveData {
  return {
    v: 1,
    stars: {},
    bestInk: {},
    honey: 60,
    boosters: { ink: 2, steel: 1, shield: 2, spray: 2, time: 1 },
    pets: ["hamster"],
    pet: "hamster",
    sound: true,
    music: true,
    endlessBest: 0,
    fails: {},
    hinted: [],
  };
}

export function loadSave(storage: Pick<Storage, "getItem"> | undefined = safeStorage()): SaveData {
  const base = defaultSave();
  try {
    const raw = storage?.getItem(SAVE_KEY);
    if (!raw) return base;
    const data = JSON.parse(raw) as Partial<SaveData>;
    if (data.v !== 1) return base;
    return {
      ...base,
      ...data,
      boosters: { ...base.boosters, ...data.boosters },
      pets: Array.isArray(data.pets) && data.pets.length > 0 ? data.pets : base.pets,
    };
  } catch {
    return base;
  }
}

export function writeSave(data: SaveData, storage: Pick<Storage, "setItem"> | undefined = safeStorage()): void {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Private mode or quota: the game keeps working without persistence.
  }
}

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export interface Reward {
  honey: number;
  newStars: number;
  firstClear: boolean;
}

/** Records a win and returns the honey earned: 10 per newly earned star, 3 for a replay. */
export function recordWin(save: SaveData, levelId: string, stars: number, inkUsed: number): Reward {
  const before = save.stars[levelId] ?? 0;
  const newStars = Math.max(0, stars - before);
  const firstClear = before === 0;
  save.stars[levelId] = Math.max(before, stars);
  save.bestInk[levelId] = Math.min(save.bestInk[levelId] ?? Infinity, inkUsed);
  save.fails[levelId] = 0;
  const honey = newStars > 0 ? newStars * 10 + (firstClear ? 5 : 0) : 3;
  save.honey += honey;
  return { honey, newStars, firstClear };
}

export function totalStars(save: SaveData): number {
  return Object.values(save.stars).reduce((a, b) => a + b, 0);
}
