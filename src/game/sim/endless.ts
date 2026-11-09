import { VIEW_W } from "../core/config";
import { Rng } from "../core/rng";
import { ground, ledge, p } from "../levels/build";
import type { LevelDef } from "../levels/types";
import type { Sim } from "./Sim";

export const ENDLESS_INK = 620;

export function endlessLevel(): LevelDef {
  return {
    id: "endless",
    world: 1,
    index: 0,
    name: "无尽蜂潮",
    tip: "每一波都能补充墨水，旧的线会慢慢消失。坚持得越久越好！",
    time: 8,
    ink: ENDLESS_INK,
    par: 0,
    terrain: [ground(1040), ledge(110, 820, 150, 30, "wood"), ledge(610, 820, 150, 30, "wood")],
    pets: [p(360, 1004)],
    hives: [],
    solution: [],
  };
}

const SPOTS = [
  { x: 110, y: 300 },
  { x: 360, y: 250 },
  { x: 610, y: 300 },
  { x: 90, y: 560 },
  { x: 630, y: 560 },
  { x: 240, y: 420 },
  { x: 480, y: 420 },
];

/** Drives endless mode: each wave adds hives with more and nastier bees. */
export class EndlessDirector {
  wave = 1;
  cleared = 0;
  private readonly rng: Rng;

  constructor(private readonly sim: Sim, seed = 20261104) {
    this.rng = new Rng(seed);
    sim.onSurvived = () => this.waveCleared();
    this.setupWave();
  }

  /** Seconds the current wave lasts. */
  get waveTime(): number {
    return Math.min(12, 7 + this.wave * 0.35);
  }

  private setupWave(): void {
    const sim = this.sim;
    const n = this.wave;
    sim.clearHives();
    sim.duration = this.waveTime;
    const hiveCount = Math.min(4, 1 + Math.floor((n + 1) / 3));
    const spots = [...SPOTS];
    const total = Math.round(10 + n * 4.5);
    for (let i = 0; i < hiveCount; i++) {
      const spot = spots.splice(this.rng.int(0, spots.length - 1), 1)[0]!;
      const share = Math.round(total / hiveCount);
      const waves: LevelDef["hives"][number]["waves"] = [{ at: 0.3 + i * 0.6, count: Math.ceil(share * 0.6) }];
      waves.push({ at: 2.5 + i * 0.5, count: Math.floor(share * 0.4) });
      if (n >= 3 && i === 0) waves.push({ at: 1.5, count: Math.min(4, Math.floor((n - 1) / 2)), kind: "hornet" });
      sim.addHive(spot.x, spot.y, spot.y < 350, waves);
    }
    if (n >= 4) {
      for (let k = 0; k < Math.min(3, n - 3); k++) {
        sim.scheduleBomb(1.5 + k * 1.7, this.rng.range(120, VIEW_W - 120));
      }
    }
  }

  private waveCleared(): boolean {
    const sim = this.sim;
    this.cleared = this.wave;
    for (const bee of sim.bees) if (bee.state !== "dead") sim.sendAway(bee);
    sim.phase = "intermission";
    sim.endT = 0;
    sim.events.push({ type: "wave", n: this.wave });
    return true;
  }

  /** Called by the UI after the intermission banner. */
  nextWave(): void {
    const sim = this.sim;
    this.wave += 1;
    sim.wave = this.wave;
    for (const ink of [...sim.inks]) if (ink.wave <= this.wave - 3) sim.removeInk(ink);
    for (const pet of sim.pets) {
      if (pet.alive && this.wave % 3 === 1) pet.hearts = Math.min(pet.maxHearts, pet.hearts + 1);
      pet.damageTaken = 0;
    }
    sim.inkBudget = ENDLESS_INK + Math.min(240, this.wave * 15);
    sim.beginPlanning();
    this.setupWave();
  }
}

export const ENDLESS_HONEY_PER_WAVE = 4;
