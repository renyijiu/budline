import { describe, expect, test } from "vitest";

import { levelById } from "../src/game/levels";
import { arc, ground, p, path } from "../src/game/levels/build";
import type { LevelDef } from "../src/game/levels/types";
import { EndlessDirector, endlessLevel } from "../src/game/sim/endless";
import { runLevel } from "../src/game/sim/runner";
import { Sim } from "../src/game/sim/Sim";
import { replayStroke } from "../src/game/sim/stroke";

const open: LevelDef = {
  id: "t-open",
  world: 1,
  index: 1,
  name: "test",
  tip: "",
  time: 8,
  ink: 900,
  par: 400,
  terrain: [ground(1050)],
  pets: [p(360, 1016)],
  hives: [{ x: 360, y: 330, waves: [{ at: 0.2, count: 14 }] }],
  solution: [arc(360, 1042, 118, 185, 355, 22)],
};

function draw(sim: Sim, points: ReturnType<typeof arc>): void {
  const r = replayStroke(points, sim.obstacles(), sim.inkLeft);
  if (r.points) sim.commitStroke(r.points);
}

function runFor(sim: Sim, seconds: number): void {
  for (let i = 0; i < seconds * 60 && sim.phase === "survive"; i++) sim.step();
}

describe("simulation", () => {
  test("is deterministic for identical input", () => {
    const snapshot = () => {
      const sim = new Sim(open);
      draw(sim, open.solution[0]!);
      runFor(sim, 4);
      const state = sim.bees.map((b) => `${b.x.toFixed(3)},${b.y.toFixed(3)}`).join("|") + sim.inks.map((i) => `${i.x.toFixed(3)},${i.angle.toFixed(4)}`).join("|");
      sim.dispose();
      return state;
    };
    expect(snapshot()).toBe(snapshot());
  });

  test("drawing the last stroke releases the swarm", () => {
    const sim = new Sim(open);
    expect(sim.phase).toBe("plan");
    sim.step();
    expect(sim.bees.length).toBe(0);
    draw(sim, open.solution[0]!);
    expect(sim.phase).toBe("survive");
    runFor(sim, 1.5);
    expect(sim.bees.length).toBe(14);
    sim.dispose();
  });

  test("an unprotected pet gets stung and the run is lost", () => {
    const result = runLevel(open, []);
    expect(result.outcome?.won).toBe(false);
    expect(result.outcome?.reason).toBe("stung");
    expect(result.stings).toBeGreaterThanOrEqual(3);
  });

  test("stars track damage and ink against par", () => {
    const tight = { ...open, par: 100 };
    const result = runLevel(tight, tight.solution);
    expect(result.outcome?.won).toBe(true);
    expect(result.outcome?.noDamage).toBe(true);
    expect(result.outcome?.underPar).toBe(false);
    expect(result.outcome?.stars).toBe(2);
  });
});

describe("boosters", () => {
  test("bubble shield absorbs hits before hearts", () => {
    const sim = new Sim(open, { boosters: ["shield"] });
    sim.release();
    const pet = sim.pets[0]!;
    expect(pet.shield).toBe(3);
    sim.damagePet(pet, { x: 0, y: 0 }, "stung");
    expect(pet.shield).toBe(2);
    expect(pet.hearts).toBe(3);
    expect(pet.damageTaken).toBe(0);
    sim.dispose();
  });

  test("hourglass shortens the timer and extra ink raises the budget", () => {
    const sim = new Sim(open, { boosters: ["time", "ink"] });
    expect(sim.duration).toBe(open.time - 3);
    expect(sim.inkBudget).toBeGreaterThan(open.ink);
    sim.dispose();
  });

  test("steel ink stays exactly where it was drawn", () => {
    const sim = new Sim(open, { boosters: ["steel"] });
    draw(sim, path(10, p(200, 600), p(500, 600)));
    const before = sim.inks[0]!.y;
    runFor(sim, 2);
    expect(sim.inks[0]!.y).toBeCloseTo(before, 5);
    sim.dispose();
  });

  test("spray stuns nearby bees", () => {
    const sim = new Sim(open, { boosters: ["spray"] });
    sim.release();
    runFor(sim, 1.2);
    const target = sim.bees.find((b) => b.state === "fly")!;
    expect(sim.spray(target)).toBe(true);
    expect(target.state).toBe("stun");
    expect(sim.sprayCharges).toBe(1);
    sim.dispose();
  });
});

describe("mechanics", () => {
  test("a stroke through a pin hangs from it instead of falling", () => {
    const level = { ...open, pins: [p(360, 500)], hives: [] };
    const sim = new Sim(level);
    draw(sim, path(10, p(360, 480), p(360, 700)));
    expect(sim.pins[0]!.attached).toBe(true);
    runFor(sim, 2);
    expect(sim.inks[0]!.y).toBeLessThan(700);
    sim.dispose();
  });

  test("bombs blast nearby bees away", () => {
    const level: LevelDef = { ...open, events: [{ type: "bomb", at: 0.1, x: 360, y: 900, fuse: 0.3 }], hives: [{ x: 360, y: 820, waves: [{ at: 0, count: 6 }] }] };
    const sim = new Sim(level);
    draw(sim, open.solution[0]!);
    let killed = 0;
    for (let i = 0; i < 90; i++) {
      sim.step();
      killed += sim.drainEvents().filter((e) => e.type === "beeKilled").length;
    }
    expect(killed).toBeGreaterThan(0);
    sim.dispose();
  });

  test("a land crocodile eats an unprotected pet", () => {
    const level = levelById("2-4")!;
    const result = runLevel(level, []);
    expect(result.outcome?.reason).toBe("eaten");
  });
});

describe("destructible ink", () => {
  test("a blast next to a stroke blows a gap and splits it", () => {
    const sim = new Sim({ ...open, hives: [] });
    draw(sim, path(10, p(150, 900), p(570, 900)));
    expect(sim.inks.length).toBe(1);
    expect(sim.cutInk({ x: 360, y: 900 }, 40)).toBe(true);
    expect(sim.inks.length).toBe(2);
    const xs = sim.inks.map((ink) => sim.inkWorldPoints(ink)).flat().map((pt) => pt.x);
    expect(xs.some((x) => x > 330 && x < 390)).toBe(false);
    sim.dispose();
  });

  test("steel ink shrugs off blasts", () => {
    const sim = new Sim({ ...open, hives: [] }, { boosters: ["steel"] });
    draw(sim, path(10, p(150, 900), p(570, 900)));
    expect(sim.cutInk({ x: 360, y: 900 }, 40)).toBe(false);
    expect(sim.inks.length).toBe(1);
    sim.dispose();
  });

  test("a boulder snaps a wall it hits head-on but rolls up a gentle ramp", () => {
    const boulder: LevelDef = { ...open, hives: [], pets: [p(120, 1016)], events: [{ type: "boulder", at: 0.1, x: 780, y: 1014, vx: -560 }] };
    const wall = new Sim({ ...boulder, pins: [p(400, 900), p(400, 1010)] });
    draw(wall, path(10, p(400, 1037), p(400, 880)));
    expect(wall.pins.every((pin) => pin.attached)).toBe(true);
    let wallCuts = 0;
    for (let i = 0; i < 120; i++) {
      wall.step();
      wallCuts += wall.drainEvents().filter((e) => e.type === "inkCut").length;
    }
    expect(wallCuts).toBeGreaterThan(0);
    expect(wall.boulders[0]!.x).toBeLessThan(380);
    wall.dispose();

    const ramp = new Sim(boulder);
    draw(ramp, path(10, p(560, 1037), p(260, 930)));
    let cuts = 0;
    for (let i = 0; i < 120; i++) {
      ramp.step();
      cuts += ramp.drainEvents().filter((e) => e.type === "inkCut").length;
    }
    expect(cuts).toBe(0);
    ramp.dispose();
  });

  test("crumbling props vanish on schedule", () => {
    const level: LevelDef = { ...open, hives: [], props: [{ type: "box", x: 360, y: 700, w: 200, h: 24, breakAt: 0.5 }] };
    const sim = new Sim(level);
    sim.release();
    runFor(sim, 0.4);
    expect(sim.props[0]!.broken).toBe(false);
    runFor(sim, 0.2);
    expect(sim.props[0]!.broken).toBe(true);
    sim.dispose();
  });
});

describe("endless mode", () => {
  test("waves advance, refill ink and keep old strokes for a while", () => {
    const sim = new Sim(endlessLevel());
    const director = new EndlessDirector(sim);
    const dome = arc(360, 1042, 112, 182, 358, 22);
    for (let wave = 1; wave <= 3; wave++) {
      expect(sim.phase).toBe("plan");
      const before = sim.inks.length;
      draw(sim, wave === 1 ? dome : path(10, p(140, 780), p(240, 780)));
      expect(sim.inks.length).toBe(before + 1);
      for (let i = 0; i < 60 * 20 && sim.phase === "survive"; i++) sim.step();
      expect(sim.phase).toBe("intermission");
      expect(director.cleared).toBe(wave);
      director.nextWave();
      expect(sim.inkLeft).toBeGreaterThan(600);
    }
    expect(director.wave).toBe(4);
    sim.dispose();
  });
});
