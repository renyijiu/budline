import * as RAPIER from "@dimforge/rapier2d-deterministic/rapier.js";

import { DT, GRAVITY_PX, GROUP, PPM, TUNING, VIEW_H, VIEW_W, groups, toM } from "../core/config";
import { clamp, dist, normalize, pointSegmentDistance, polylineLength, resample, rotate, simplify, sub, type Vec } from "../core/math";
import { Rng, hashString } from "../core/rng";
import type { BeeKind, Hazard, LevelDef, PetKind, Rect } from "../levels/types";
import { spawnBee, updateBee, BEE_RADIUS } from "./bees";
import { ICICLE_HALF, preStepBoulder, preStepIcicle, updateBomb, updateBoulder, updateCroc, updateFrog, updateIcicle, CROC_HALF } from "./enemies";
import type { Obstacles } from "./stroke";
import type {
  Bee,
  Bomb,
  Boulder,
  BoosterId,
  Croc,
  DeathReason,
  Frog,
  Hive,
  Icicle,
  Ink,
  Outcome,
  Pet,
  Phase,
  Pin,
  Prop,
  SimEvent,
} from "./types";

export interface SimOptions {
  boosters?: readonly BoosterId[];
  petKinds?: readonly PetKind[];
  seed?: number;
}

export const HIVE_RADIUS = 30;
export const FROG_RADIUS = 26;
/** Rafts are buoyant enough to carry a pet and a stroke of ink. */
const RAFT_LIFT = 16;

const ALL = 0xffff;
const SOLID_FOR_INK = GROUP.TERRAIN | GROUP.INK | GROUP.PET | GROUP.BEE | GROUP.PROP | GROUP.CROC | GROUP.HIVE | GROUP.NET;

/**
 * Headless, deterministic simulation of one level. Rendering and input live elsewhere and only
 * read this state, so every level can be verified in tests with its reference stroke.
 */
export class Sim {
  readonly world: RAPIER.World;
  readonly rng: Rng;
  phase: Phase = "plan";
  /** Seconds since release (the survival timer). */
  time = 0;
  /** Seconds since won/lost. */
  endT = 0;
  duration: number;
  inkBudget: number;
  inkUsed = 0;
  strokesLeft: number;
  readonly steelInk: boolean;
  sprayCharges: number;
  readonly pets: Pet[] = [];
  readonly bees: Bee[] = [];
  readonly inks: Ink[] = [];
  readonly props: Prop[] = [];
  readonly hives: Hive[] = [];
  readonly crocs: Croc[] = [];
  readonly frogs: Frog[] = [];
  readonly bombs: Bomb[] = [];
  readonly boulders: Boulder[] = [];
  readonly icicles: Icicle[] = [];
  readonly pins: Pin[] = [];
  readonly hazards: Hazard[];
  events: SimEvent[] = [];
  outcome: Outcome | undefined;
  wave = 1;
  /** Called when a survive phase ends successfully; endless mode uses it to queue the next wave. */
  onSurvived: ((sim: Sim) => boolean) | undefined;

  private terrainBody: RAPIER.RigidBody;
  private readonly frogColliders = new Map<Frog, RAPIER.Collider>();
  private readonly hiveColliders = new Map<Hive, RAPIER.Collider>();
  private readonly pending: Array<NonNullable<LevelDef["events"]>[number]>;
  private nextId = 1;
  private lastTick = 99;
  private bumpBudget = 0;
  private disposed = false;

  constructor(
    readonly level: LevelDef,
    readonly options: SimOptions = {},
  ) {
    const boosters = new Set(options.boosters ?? []);
    this.rng = new Rng(options.seed ?? level.seed ?? hashString(level.id));
    this.world = new RAPIER.World({ x: 0, y: GRAVITY_PX / PPM });
    this.world.timestep = DT;
    this.world.integrationParameters.numSolverIterations = 8;
    this.duration = Math.max(4, level.time - (boosters.has("time") ? TUNING.timeBoosterCut : 0));
    this.inkBudget = Math.round(level.ink * (boosters.has("ink") ? 1 + TUNING.inkBoosterBonus : 1));
    this.strokesLeft = level.strokes ?? 1;
    this.steelInk = boosters.has("steel");
    this.sprayCharges = boosters.has("spray") ? 2 : 0;
    this.hazards = level.hazards ?? [];
    this.pending = [...(level.events ?? [])].sort((a, b) => a.at - b.at);

    this.terrainBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.buildTerrain();
    this.buildProps();
    this.buildHives();
    this.buildEnemies();
    for (const pin of level.pins ?? []) this.pins.push({ x: pin.x, y: pin.y, attached: false });

    const kinds = options.petKinds ?? [];
    level.pets.forEach((spawn, i) => {
      const kind = kinds[i] ?? (i === 0 ? "hamster" : "chick");
      this.addPet(spawn.x, spawn.y, kind, level.hearts ?? TUNING.petHearts, boosters.has("shield") ? TUNING.shieldHits : 0);
    });
    this.syncAll();
  }

  // ---------------------------------------------------------------- construction

  private buildTerrain(): void {
    for (const shape of this.level.terrain) {
      const pts = new Float32Array(shape.poly.flatMap((v) => [toM(v.x), toM(v.y)]));
      const desc = RAPIER.ColliderDesc.convexHull(pts);
      if (!desc) continue;
      desc.setFriction(shape.friction ?? (shape.style === "ice" ? 0.03 : 0.9)).setCollisionGroups(groups(shape.porous ? GROUP.NET : GROUP.TERRAIN, ALL));
      // Ice stays slippery whatever touches it.
      if (shape.style === "ice") desc.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min);
      this.world.createCollider(desc, this.terrainBody);
    }
    for (const h of this.hazards) {
      if (h.type !== "spikes") continue;
      const height = 26;
      const tipY = h.dir === "up" ? h.y - height : h.y + height;
      for (let x = h.x1; x < h.x2 - 4; x += 24) {
        const a = { x: toM(x), y: toM(h.y) };
        const b = { x: toM(Math.min(x + 24, h.x2)), y: toM(h.y) };
        const c = { x: toM(x + 12), y: toM(tipY) };
        const desc = RAPIER.ColliderDesc.triangle(a, b, c).setCollisionGroups(groups(GROUP.TERRAIN, ALL));
        this.world.createCollider(desc, this.terrainBody);
      }
    }
  }

  private buildProps(): void {
    for (const def of this.level.props ?? []) {
      if (def.type === "box" || def.type === "raft") {
        const dynamic = def.type === "raft" || def.dynamic === true;
        const desc = dynamic ? RAPIER.RigidBodyDesc.dynamic() : RAPIER.RigidBodyDesc.fixed();
        desc.setTranslation(toM(def.x), toM(def.y)).setRotation(def.type === "box" ? (def.angle ?? 0) : 0);
        if (def.type === "raft") desc.setAngularDamping(def.buoyancy !== undefined ? 0.8 : 3).setLinearDamping(0.5);
        const body = this.world.createRigidBody(desc);
        const col = RAPIER.ColliderDesc.cuboid(toM(def.w / 2), toM(def.h / 2))
          .setDensity(def.type === "raft" ? 0.45 : 1.2)
          .setFriction(0.9)
          .setCollisionGroups(groups(GROUP.PROP, ALL));
        this.world.createCollider(col, body);
        this.props.push({
          body,
          shape: { kind: "box", w: def.w, h: def.h },
          style: def.type === "raft" ? "wood" : (def.style ?? "wood"),
          role: def.type,
          x: def.x,
          y: def.y,
          angle: 0,
          samples: boxSamples(def.w, def.h),
          broken: false,
          ...(def.type === "box" && def.breakAt !== undefined ? { breakAt: def.breakAt } : {}),
          ...(def.type === "raft" && def.buoyancy !== undefined ? { buoyancy: def.buoyancy } : {}),
        });
      } else if (def.type === "ball") {
        const body = this.world.createRigidBody(
          (def.dynamic === false ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic()).setTranslation(toM(def.x), toM(def.y)),
        );
        this.world.createCollider(
          RAPIER.ColliderDesc.ball(toM(def.r)).setDensity(1.4).setFriction(0.7).setCollisionGroups(groups(GROUP.PROP, ALL)),
          body,
        );
        this.props.push({ body, shape: { kind: "ball", r: def.r }, style: "rock", role: "ball", x: def.x, y: def.y, angle: 0, samples: [{ x: 0, y: 0 }], broken: false });
      } else if (def.type === "seesaw") {
        const h = def.h ?? 22;
        const body = this.world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic().setTranslation(toM(def.x), toM(def.y)).setRotation(def.angle ?? 0).setAngularDamping(0.6),
        );
        const plank = RAPIER.ColliderDesc.cuboid(toM(def.w / 2), toM(h / 2)).setDensity(1.0).setFriction(def.icy ? 0.03 : 1).setCollisionGroups(groups(GROUP.PROP, ALL));
        if (def.icy) plank.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min);
        this.world.createCollider(plank, body);
        const joint = RAPIER.JointData.revolute({ x: 0, y: 0 }, { x: toM(def.x), y: toM(def.y) });
        this.world.createImpulseJoint(joint, body, this.terrainBody, true);
        this.props.push({
          body,
          shape: { kind: "box", w: def.w, h },
          style: def.icy ? "ice" : "wood",
          role: "seesaw",
          x: def.x,
          y: def.y,
          angle: 0,
          pivot: { x: def.x, y: def.y },
          samples: boxSamples(def.w, h),
          broken: false,
        });
      } else {
        const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(toM(def.x), toM(def.y)));
        this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(toM(def.w / 2), toM(def.h / 2)).setFriction(1.2).setCollisionGroups(groups(GROUP.PROP, ALL)),
          body,
        );
        this.props.push({
          body,
          shape: { kind: "box", w: def.w, h: def.h },
          style: def.style ?? "wood",
          role: "mover",
          x: def.x,
          y: def.y,
          angle: 0,
          mover: { from: { x: def.x, y: def.y }, to: def.to, period: def.period },
          samples: [],
          broken: false,
        });
      }
    }
  }

  private buildHives(): void {
    for (const def of this.level.hives) this.addHive(def.x, def.y, def.hang ?? false, def.waves);
  }

  addHive(x: number, y: number, hang: boolean, waves: LevelDef["hives"][number]["waves"], offset = 0): Hive {
    const queue: Hive["queue"] = [];
    for (const wave of waves) {
      const over = wave.over ?? Math.min(1.6, 0.25 + wave.count * 0.07);
      for (let i = 0; i < wave.count; i++) {
        queue.push({ t: offset + wave.at + (wave.count > 1 ? (over * i) / (wave.count - 1) : 0), kind: wave.kind ?? "bee" });
      }
    }
    queue.sort((a, b) => a.t - b.t);
    const body = this.terrainBody;
    const col = this.world.createCollider(
      RAPIER.ColliderDesc.ball(toM(HIVE_RADIUS))
        .setTranslation(toM(x), toM(y))
        .setCollisionGroups(groups(GROUP.HIVE, GROUP.INK | GROUP.PET | GROUP.PROP | GROUP.CROC)),
      body,
    );
    const hive: Hive = { x, y, hang, queue, total: queue.length, pulse: 0 };
    this.hiveColliders.set(hive, col);
    this.hives.push(hive);
    return hive;
  }

  private buildEnemies(): void {
    for (const def of this.level.enemies ?? []) {
      if (def.type === "frog") {
        const frog: Frog = {
          x: def.x,
          y: def.y,
          facing: 1,
          state: "idle",
          stateT: 0,
          next: def.delay ?? 1.2,
          interval: def.interval ?? 2.6,
          aim: { x: 0, y: 0 },
          tip: { x: def.x, y: def.y },
          reach: 0,
          hitPet: false,
        };
        const col = this.world.createCollider(
          RAPIER.ColliderDesc.ball(toM(FROG_RADIUS)).setTranslation(toM(def.x), toM(def.y)).setCollisionGroups(groups(GROUP.TERRAIN, ALL)),
          this.terrainBody,
        );
        this.frogColliders.set(frog, col);
        this.frogs.push(frog);
      } else {
        const body = this.world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic().setTranslation(toM(def.x), toM(def.y)).lockRotations().setLinearDamping(0.4),
        );
        this.world.createCollider(
          RAPIER.ColliderDesc.roundCuboid(toM(CROC_HALF.x - 8), toM(CROC_HALF.y - 8), toM(8))
            .setDensity(def.mode === "water" ? 0.9 : 2.2)
            .setFriction(0.15)
            .setCollisionGroups(groups(GROUP.CROC, GROUP.TERRAIN | GROUP.INK | GROUP.PET | GROUP.PROP | GROUP.HIVE | GROUP.NET)),
          body,
        );
        const water = def.mode === "water" ? this.findFluid(def.x, def.y + 10, "water") : undefined;
        const croc: Croc = {
          body,
          mode: def.mode,
          state: "idle",
          stateT: 0,
          facing: -1,
          x: def.x,
          y: def.y,
          vx: 0,
          vy: 0,
          jaw: 0,
          delay: def.delay ?? 0.6,
          samples: boxSamples(CROC_HALF.x * 2, CROC_HALF.y * 2),
        };
        if (water) croc.water = water;
        this.crocs.push(croc);
      }
    }
  }

  private findFluid(x: number, y: number, type: "water" | "lava"): Rect | undefined {
    for (const h of this.hazards) {
      if (h.type === type && x >= h.x && x <= h.x + h.w && y >= h.y - 60 && y <= h.y + h.h) return h;
    }
    return undefined;
  }

  addPet(x: number, y: number, kind: PetKind, hearts: number, shield: number): Pet {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(toM(x), toM(y)).lockRotations().setLinearDamping(0.15),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(toM(TUNING.petRadius))
        .setDensity(TUNING.petDensity)
        .setFriction(TUNING.petFriction)
        .setCollisionGroups(groups(GROUP.PET, ALL)),
      body,
    );
    const pet: Pet = {
      body,
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      hearts,
      maxHearts: hearts,
      shield,
      invuln: 0,
      alive: true,
      mood: "idle",
      hurtT: 0,
      look: { x: 0, y: 0 },
      damageTaken: 0,
    };
    this.pets.push(pet);
    return pet;
  }

  // ---------------------------------------------------------------- drawing

  /** Geometry a new stroke must avoid, captured from the current (frozen) state. */
  obstacles(): Obstacles {
    const polys: Vec[][] = this.level.terrain.map((t) => t.poly);
    const circles: Obstacles["circles"] = [];
    for (const h of this.hazards) {
      if (h.type === "spikes") {
        const y2 = h.dir === "up" ? h.y - 30 : h.y + 30;
        polys.push([
          { x: h.x1, y: h.y },
          { x: h.x2, y: h.y },
          { x: h.x2, y: y2 },
          { x: h.x1, y: y2 },
        ]);
      }
    }
    for (const pet of this.pets) circles.push({ x: pet.x, y: pet.y, r: TUNING.petRadius + 5 });
    for (const hive of this.hives) circles.push({ x: hive.x, y: hive.y, r: HIVE_RADIUS + 2 });
    for (const frog of this.frogs) circles.push({ x: frog.x, y: frog.y, r: FROG_RADIUS + 2 });
    for (const b of this.bees) if (b.state !== "dead") circles.push({ x: b.x, y: b.y, r: b.radius + 1 });
    for (const bomb of this.bombs) if (bomb.alive) circles.push({ x: bomb.x, y: bomb.y, r: TUNING.bombRadius + 2 });
    for (const b of this.boulders) if (b.alive) circles.push({ x: b.x, y: b.y, r: b.r + 2 });
    for (const ic of this.hangingIcicles()) {
      polys.push([
        { x: ic.x - ICICLE_HALF.w - 2, y: ic.y },
        { x: ic.x + ICICLE_HALF.w + 2, y: ic.y },
        { x: ic.x, y: ic.y + ICICLE_HALF.h * 2 + 2 },
      ]);
    }
    for (const croc of this.crocs) polys.push(transformed(croc.samples.slice(0, 4), croc.x, croc.y, 0, 4));
    for (const prop of this.props) {
      if (prop.broken) continue;
      if (prop.shape.kind === "ball") circles.push({ x: prop.x, y: prop.y, r: prop.shape.r + 2 });
      else polys.push(transformed(boxSamples(prop.shape.w, prop.shape.h).slice(0, 4), prop.x, prop.y, prop.angle, 2));
    }
    const zones = (this.level.noDraw ?? []).map((r) => [
      { x: r.x, y: r.y },
      { x: r.x + r.w, y: r.y },
      { x: r.x + r.w, y: r.y + r.h },
      { x: r.x, y: r.y + r.h },
    ]);
    const lines = this.inks.map((ink) => this.inkWorldPoints(ink));
    return { polys, circles, lines, zones };
  }

  get inkLeft(): number {
    return Math.max(0, this.inkBudget - this.inkUsed);
  }

  /** Turns a validated stroke into a physical body. Returns null if the stroke is degenerate. */
  commitStroke(points: readonly Vec[]): Ink | null {
    if (this.phase !== "plan" || this.strokesLeft <= 0 || points.length < 2) return null;
    const ink = this.buildInk(points, this.steelInk, this.wave, this.pins);
    this.inkUsed += polylineLength(points);
    this.strokesLeft -= 1;
    if (this.strokesLeft <= 0) this.release();
    return ink;
  }

  /** Creates a stroke body from world-space points and pins it to any nearby unattached pins. */
  private buildInk(points: readonly Vec[], fixed: boolean, wave: number, pins: readonly Pin[], linvel?: RAPIER.Vector, angvel = 0): Ink {
    let cx = 0;
    let cy = 0;
    for (const pt of points) {
      cx += pt.x;
      cy += pt.y;
    }
    cx /= points.length;
    cy /= points.length;
    const desc = (fixed ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic())
      .setTranslation(toM(cx), toM(cy))
      .setCcdEnabled(true)
      .setAngularDamping(0.4)
      .setLinearDamping(0.05);
    if (linvel) desc.setLinvel(linvel.x, linvel.y).setAngvel(angvel);
    const body = this.world.createRigidBody(desc);
    const local = points.map((pt) => ({ x: pt.x - cx, y: pt.y - cy }));
    const r = toM(TUNING.inkRadius);
    for (let i = 1; i < local.length; i++) {
      const a = local[i - 1]!;
      const b = local[i]!;
      const segLen = dist(a, b);
      const col =
        segLen < 0.5
          ? RAPIER.ColliderDesc.ball(r).setTranslation(toM(a.x), toM(a.y))
          : RAPIER.ColliderDesc.capsule(toM(segLen / 2), r)
              .setTranslation(toM((a.x + b.x) / 2), toM((a.y + b.y) / 2))
              .setRotation(Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2);
      col.setDensity(TUNING.inkDensity).setFriction(TUNING.inkFriction).setCollisionGroups(groups(GROUP.INK, SOLID_FOR_INK));
      this.world.createCollider(col, body);
    }
    const attached: Pin[] = [];
    if (!fixed) {
      for (const pin of pins) {
        if (pin.attached) continue;
        let near = Infinity;
        for (let i = 1; i < points.length; i++) near = Math.min(near, pointSegmentDistance(pin, points[i - 1]!, points[i]!));
        if (near > TUNING.pinRadius) continue;
        const anchorBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(toM(pin.x), toM(pin.y)));
        const joint = RAPIER.JointData.revolute({ x: toM(pin.x - cx), y: toM(pin.y - cy) }, { x: 0, y: 0 });
        this.world.createImpulseJoint(joint, body, anchorBody, true);
        pin.attached = true;
        attached.push(pin);
        if (!linvel) this.events.push({ type: "pin", x: pin.x, y: pin.y });
      }
    }
    const ink: Ink = { id: this.nextId++, body, local, fixed, x: cx, y: cy, angle: 0, wave, pins: attached };
    this.inks.push(ink);
    return ink;
  }

  /**
   * Blows away every stroke segment within `radius` of `at` (steel ink is immune) and splits what is
   * left into separate pieces. Returns true if anything was cut.
   */
  cutInk(at: Vec, radius: number, needsSight = true): boolean {
    let cutAny = false;
    for (const ink of [...this.inks]) {
      if (ink.fixed) continue;
      // Resample so a long straight stroke (one collider) only loses the part near the blast.
      const pts = resample(this.inkWorldPoints(ink), 8);
      const dead: boolean[] = [];
      let any = false;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!;
        const b = pts[i]!;
        const hit = pointSegmentDistance(at, a, b) < radius && (!needsSight || !this.blocked(at, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, GROUP.TERRAIN));
        dead.push(hit);
        any ||= hit;
      }
      if (!any) continue;
      cutAny = true;
      const linvel = ink.body.linvel();
      const angvel = ink.body.angvel();
      for (const pin of ink.pins) pin.attached = false;
      this.removeInk(ink);
      let run: Vec[] = [];
      const flush = () => {
        if (run.length >= 2 && polylineLength(run) >= 14) this.buildInk(simplify(run, TUNING.strokeSimplifyEpsilon), false, ink.wave, ink.pins, linvel, angvel);
        run = [];
      };
      for (let i = 1; i < pts.length; i++) {
        if (dead[i - 1]) {
          flush();
          const a = pts[i - 1]!;
          const b = pts[i]!;
          this.events.push({ type: "inkCut", x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
          continue;
        }
        if (run.length === 0) run.push(pts[i - 1]!);
        run.push(pts[i]!);
      }
      flush();
    }
    return cutAny;
  }

  /** Starts the survival phase (also used by the "go" button when strokes remain). */
  release(): void {
    if (this.phase !== "plan") return;
    this.phase = "survive";
    this.events.push({ type: "release" });
  }

  inkWorldPoints(ink: Ink): Vec[] {
    return transformed(ink.local, ink.x, ink.y, ink.angle, 0);
  }

  spray(at: Vec): boolean {
    if (this.phase !== "survive" || this.sprayCharges <= 0) return false;
    this.sprayCharges -= 1;
    for (const bee of this.bees) {
      if (bee.state !== "fly" && bee.state !== "stun") continue;
      const d = dist(bee, at);
      if (d > TUNING.sprayRadius) continue;
      bee.state = "stun";
      bee.stunT = TUNING.sprayStun;
      const away = normalize(sub(bee, at));
      const push = 420 * (1 - d / TUNING.sprayRadius) + 120;
      bee.body.setLinvel({ x: toM(away.x * push), y: toM(away.y * push) }, true);
    }
    this.events.push({ type: "spray", x: at.x, y: at.y });
    return true;
  }

  // ---------------------------------------------------------------- simulation

  step(): void {
    if (this.disposed || this.phase === "plan") return;
    const surviving = this.phase === "survive";
    if (surviving) this.time += DT;
    else this.endT += DT;
    this.bumpBudget = Math.min(3, this.bumpBudget + 0.25);

    if (surviving) {
      this.spawnFromHives();
      this.fireEvents();
      for (const prop of this.props) if (prop.breakAt !== undefined && !prop.broken && this.time >= prop.breakAt) this.crumble(prop);
    }
    for (const prop of this.props) if (prop.mover) this.moveMover(prop);
    for (const bee of this.bees) updateBee(this, bee, DT);
    for (const croc of this.crocs) updateCroc(this, croc, DT);
    for (const frog of this.frogs) updateFrog(this, frog, DT, this.frogColliders.get(frog));
    this.applyFields();
    for (const b of this.boulders) if (b.alive) preStepBoulder(this, b, DT);
    for (const ic of this.icicles) if (ic.alive) preStepIcicle(this, ic, DT);

    this.world.step();
    this.syncAll();

    for (const bomb of this.bombs) if (bomb.alive) updateBomb(this, bomb, DT);
    for (const b of this.boulders) if (b.alive) updateBoulder(this, b);
    for (const ic of this.icicles) if (ic.alive) updateIcicle(this, ic, DT);
    this.checkStings();
    this.updatePets();
    this.cleanup();

    if (this.phase === "survive") {
      const left = Math.ceil(this.duration - this.time);
      if (left <= 3 && left >= 1 && left < this.lastTick) {
        this.lastTick = left;
        this.events.push({ type: "tick", n: left });
      }
      if (this.time >= this.duration) this.finishSurvive();
    }
  }

  private finishSurvive(): void {
    if (this.onSurvived?.(this)) return;
    this.phase = "won";
    this.endT = 0;
    for (const bee of this.bees) if (bee.state !== "dead") this.sendAway(bee);
    for (const pet of this.pets) pet.mood = "happy";
    this.outcome = this.computeOutcome(true);
    this.events.push({ type: "won" });
  }

  sendAway(bee: Bee): void {
    bee.state = "leave";
    bee.body.setGravityScale(0, true);
    for (let i = 0; i < bee.body.numColliders(); i++) bee.body.collider(i).setCollisionGroups(groups(GROUP.BEE, 0));
  }

  /** Resets per-wave counters (endless mode). */
  beginPlanning(): void {
    this.phase = "plan";
    this.time = 0;
    this.lastTick = 99;
    this.strokesLeft = this.level.strokes ?? 1;
    this.inkUsed = 0;
  }

  private computeOutcome(won: boolean, reason?: DeathReason): Outcome {
    const noDamage = this.pets.every((p) => p.damageTaken === 0);
    const underPar = this.inkUsed <= this.level.par;
    const outcome: Outcome = {
      won,
      stars: won ? 1 + (noDamage ? 1 : 0) + (underPar ? 1 : 0) : 0,
      noDamage,
      underPar,
      inkUsed: Math.round(this.inkUsed),
      par: this.level.par,
    };
    if (reason) outcome.reason = reason;
    return outcome;
  }

  private spawnFromHives(): void {
    for (const hive of this.hives) {
      hive.pulse = Math.max(0, hive.pulse - DT * 3);
      while (hive.queue.length > 0 && hive.queue[0]!.t <= this.time) {
        const item = hive.queue.shift()!;
        this.spawnBeeFrom(hive, item.kind);
      }
    }
  }

  spawnBeeFrom(hive: Hive, kind: BeeKind): Bee {
    const target = this.nearestPet(hive) ?? { x: VIEW_W / 2, y: VIEW_H / 2 };
    const dir = rotate(normalize(sub(target, hive)), this.rng.range(-0.7, 0.7));
    const r = BEE_RADIUS[kind];
    const pos = { x: hive.x + dir.x * (HIVE_RADIUS + r + 4), y: hive.y + dir.y * (HIVE_RADIUS + r + 4) };
    const bee = spawnBee(this, this.nextId++, kind, pos, { x: dir.x * 260, y: dir.y * 260 });
    this.bees.push(bee);
    hive.pulse = 1;
    if (this.bees.length % 4 === 1) this.events.push({ type: "spawn", x: hive.x, y: hive.y });
    return bee;
  }

  private fireEvents(): void {
    while (this.pending.length > 0 && this.pending[0]!.at <= this.time) {
      const ev = this.pending.shift()!;
      if (ev.type === "bomb") this.dropBomb(ev.x, ev.y ?? 60, ev.vx ?? 0, ev.fuse ?? 2.1);
      else if (ev.type === "icicle") this.dropIcicle(ev.x, ev.y);
      else this.rollBoulder(ev.x, ev.y, ev.vx, ev.vy ?? 0, ev.r ?? TUNING.boulderRadius);
    }
  }

  /** Adds a bomb drop at survive-time `at` (endless mode). */
  scheduleBomb(at: number, x: number): void {
    this.pending.push({ type: "bomb", at, x });
    this.pending.sort((a, b) => a.at - b.at);
  }

  dropBomb(x: number, y: number, vx: number, fuse: number): void {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(toM(x), toM(y)).setLinvel(toM(vx), 0).setCcdEnabled(true),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(toM(TUNING.bombRadius)).setDensity(2.2).setFriction(0.6).setRestitution(0.25).setCollisionGroups(groups(GROUP.PROP, ALL)),
      body,
    );
    this.bombs.push({ body, x, y, angle: 0, fuse, maxFuse: fuse, alive: true });
    this.events.push({ type: "warn", x, y, what: "bomb" });
  }

  rollBoulder(x: number, y: number, vx: number, vy: number, r: number): void {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(toM(x), toM(y)).setLinvel(toM(vx), toM(vy)).setCcdEnabled(true),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(toM(r)).setDensity(5).setFriction(0.9).setRestitution(0.05).setCollisionGroups(groups(GROUP.PROP, ALL)),
      body,
    );
    this.boulders.push({ body, r, x, y, angle: 0, alive: true, cutCd: 0 });
  }

  dropIcicle(x: number, y: number): void {
    const cy = y + ICICLE_HALF.h;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(toM(x), toM(cy)).lockRotations().setCcdEnabled(true),
    );
    const { w, h } = ICICLE_HALF;
    const shape = RAPIER.ColliderDesc.convexHull(new Float32Array([toM(-w), toM(-h), toM(w), toM(-h), 0, toM(h)]))!;
    this.world.createCollider(shape.setDensity(3).setFriction(0.05).setRestitution(0).setCollisionGroups(groups(GROUP.PROP, ALL)), body);
    this.icicles.push({ body, x, y: cy, vx: 0, vy: 0, age: 0, cutCd: 0, alive: true });
  }

  shatterIcicle(icicle: Icicle): void {
    if (!icicle.alive) return;
    icicle.alive = false;
    this.world.removeRigidBody(icicle.body);
    this.events.push({ type: "shatter", x: icicle.x, y: icicle.y + ICICLE_HALF.h * 0.6 });
  }

  /** Icicles still hanging, as drawing obstacles and for rendering. */
  hangingIcicles(): Array<{ x: number; y: number; at: number }> {
    const out: Array<{ x: number; y: number; at: number }> = [];
    for (const ev of this.level.events ?? []) if (ev.type === "icicle" && (this.phase === "plan" || ev.at > this.time)) out.push(ev);
    return out;
  }

  private crumble(prop: Prop): void {
    prop.broken = true;
    this.world.removeRigidBody(prop.body);
    const shape = prop.shape.kind === "box" ? prop.shape : { w: 40, h: 40 };
    this.events.push({ type: "crumble", x: prop.x, y: prop.y, w: shape.w, h: shape.h });
  }

  private moveMover(prop: Prop): void {
    const m = prop.mover!;
    const k = 0.5 - 0.5 * Math.cos((2 * Math.PI * this.time) / m.period);
    const x = m.from.x + (m.to.x - m.from.x) * k;
    const y = m.from.y + (m.to.y - m.from.y) * k;
    prop.body.setNextKinematicTranslation({ x: toM(x), y: toM(y) });
  }

  private applyFields(): void {
    for (const h of this.hazards) {
      if (h.type === "wind") {
        if (h.period && ((this.time + (h.phase ?? 0)) % h.period) / h.period > (h.duty ?? 0.5)) continue;
        if (this.phase !== "survive") continue;
        const inZone = (x: number, y: number) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h;
        const push = (body: RAPIER.RigidBody, factor: number) => {
          const m = body.mass();
          body.applyImpulse({ x: toM(h.fx) * m * DT * factor, y: toM(h.fy) * m * DT * factor }, true);
        };
        for (const b of this.bees) if (b.state === "fly" && inZone(b.x, b.y)) push(b.body, b.kind === "hornet" ? 0.5 : 1);
        for (const ink of this.inks) if (!ink.fixed && inZone(ink.x, ink.y)) push(ink.body, 0.3);
        for (const pet of this.pets) if (pet.alive && inZone(pet.x, pet.y)) push(pet.body, 0.22);
        for (const prop of this.props) if (!prop.broken && prop.role !== "mover" && inZone(prop.x, prop.y)) push(prop.body, 0.3);
      } else if (h.type === "water" || h.type === "lava") {
        const lift = h.type === "water" ? 1.7 : 0.55;
        const drag = h.type === "water" ? 2.2 : 5;
        for (const ink of this.inks) {
          if (ink.fixed) continue;
          const sinking = this.applyFluid(ink.body, ink.local, ink.x, ink.y, ink.angle, h, lift, drag);
          if (h.type === "lava" && sinking && this.rng.next() < 0.08) this.events.push({ type: "sizzle", x: ink.x, y: h.y });
        }
        for (const prop of this.props) {
          if (prop.broken || prop.role === "mover" || prop.role === "seesaw" || !prop.body.isDynamic()) continue;
          this.applyFluid(prop.body, prop.samples, prop.x, prop.y, prop.angle, h, prop.role === "raft" ? (prop.buoyancy ?? RAFT_LIFT) : lift, drag);
        }
        for (const croc of this.crocs) {
          if (croc.mode === "water" && croc.state !== "leap") this.applyFluid(croc.body, croc.samples, croc.x, croc.y, 0, h, 1.9, 3.2);
        }
      }
    }
  }

  /** Buoyancy and drag on sample points below the surface. Returns true if anything is submerged. */
  private applyFluid(body: RAPIER.RigidBody, samples: readonly Vec[], x: number, y: number, angle: number, h: Rect, lift: number, drag: number): boolean {
    if (samples.length === 0) return false;
    const pts = transformed(samples, x, y, angle, 0);
    const per = body.mass() / pts.length;
    const g = GRAVITY_PX / PPM;
    const vel = body.linvel();
    let any = false;
    for (const pt of pts) {
      if (pt.x < h.x || pt.x > h.x + h.w || pt.y < h.y) continue;
      any = true;
      const depth = clamp((pt.y - h.y) / 30, 0.2, 1);
      body.applyImpulseAtPoint(
        { x: -vel.x * drag * per * DT, y: (-g * lift * depth - vel.y * drag) * per * DT },
        { x: toM(pt.x), y: toM(pt.y) },
        true,
      );
    }
    return any;
  }

  private syncAll(): void {
    for (const pet of this.pets) syncBody(pet, pet.body);
    for (const bee of this.bees) {
      if (bee.state === "dead") continue;
      syncBody(bee, bee.body);
      const speed = Math.hypot(bee.vx, bee.vy);
      if (bee.state === "fly" && bee.lastSpeed - speed > 170 && this.bumpBudget >= 1) {
        this.bumpBudget -= 1;
        this.events.push({ type: "bump", x: bee.x, y: bee.y, power: clamp((bee.lastSpeed - speed) / 400, 0, 1) });
      }
      bee.lastSpeed = speed;
      if (Math.abs(bee.vx) > 30) bee.facing = bee.vx > 0 ? 1 : -1;
    }
    for (const ink of this.inks) {
      const t = ink.body.translation();
      ink.x = t.x * PPM;
      ink.y = t.y * PPM;
      ink.angle = ink.body.rotation();
    }
    for (const prop of this.props) {
      if (prop.broken) continue;
      const t = prop.body.translation();
      prop.x = t.x * PPM;
      prop.y = t.y * PPM;
      prop.angle = prop.body.rotation();
    }
    for (const croc of this.crocs) syncBody(croc, croc.body);
    for (const bomb of this.bombs) {
      if (!bomb.alive) continue;
      const t = bomb.body.translation();
      bomb.x = t.x * PPM;
      bomb.y = t.y * PPM;
      bomb.angle = bomb.body.rotation();
    }
    for (const ic of this.icicles) if (ic.alive) syncBody(ic, ic.body);
    for (const b of this.boulders) {
      if (!b.alive) continue;
      const t = b.body.translation();
      b.x = t.x * PPM;
      b.y = t.y * PPM;
      b.angle = b.body.rotation();
    }
  }

  private checkStings(): void {
    for (const bee of this.bees) {
      if (bee.state !== "fly" || bee.stingCd > 0) continue;
      for (const pet of this.pets) {
        if (!pet.alive) continue;
        const reach = bee.radius + TUNING.petRadius + 3;
        const dx = bee.x - pet.x;
        const dy = bee.y - pet.y;
        if (dx * dx + dy * dy > reach * reach) continue;
        this.damagePet(pet, bee, "stung");
        const away = normalize({ x: dx, y: dy });
        bee.body.setLinvel({ x: toM(away.x * TUNING.beeKnockback), y: toM(away.y * TUNING.beeKnockback) }, true);
        bee.stingCd = TUNING.beeStingCooldown;
        bee.orbitT = this.rng.range(0.4, 0.9);
        bee.orbitSign = this.rng.sign();
        if (bee.kind === "hornet") bee.mode = "recover";
        bee.modeT = 0;
        break;
      }
    }
  }

  /** Applies one hit. Shields absorb, invulnerability frames ignore, `fatal` kills outright. */
  damagePet(pet: Pet, from: Vec, reason: DeathReason, fatal = false): void {
    if (!pet.alive || this.phase !== "survive") return;
    if (pet.shield > 0) {
      pet.shield -= 1;
      pet.invuln = 0.45;
      this.events.push({ type: "shieldPop", x: pet.x, y: pet.y });
      return;
    }
    if (pet.invuln > 0 && !fatal) return;
    pet.hearts = fatal ? 0 : pet.hearts - 1;
    pet.damageTaken += 1;
    pet.invuln = TUNING.petInvulnerable;
    pet.hurtT = 0.45;
    const away = normalize(sub(pet, from));
    pet.body.applyImpulse({ x: away.x * pet.body.mass() * 2.2, y: (away.y - 0.6) * pet.body.mass() * 2.2 }, true);
    this.events.push(reason === "stung" ? { type: "sting", x: pet.x, y: pet.y } : { type: "hurt", x: pet.x, y: pet.y, source: reason });
    if (pet.hearts <= 0) this.killPet(pet, reason);
  }

  killPet(pet: Pet, reason: DeathReason): void {
    if (!pet.alive || this.phase !== "survive") return;
    pet.alive = false;
    pet.hearts = 0;
    pet.mood = "dead";
    this.phase = "lost";
    this.endT = 0;
    this.outcome = this.computeOutcome(false, reason);
    this.events.push({ type: "lost", reason });
  }

  private updatePets(): void {
    for (const pet of this.pets) {
      pet.invuln = Math.max(0, pet.invuln - DT);
      pet.hurtT = Math.max(0, pet.hurtT - DT);
      if (!pet.alive) continue;
      if (this.phase === "survive") {
        if (pet.y > VIEW_H + 60 || pet.x < -60 || pet.x > VIEW_W + 60) this.killPet(pet, "fell");
        for (const h of this.hazards) {
          if (h.type === "water" || h.type === "lava") {
            if (pet.x > h.x && pet.x < h.x + h.w && pet.y + TUNING.petRadius * 0.75 > h.y && pet.y < h.y + h.h + 40) {
              this.events.push({ type: "splash", x: pet.x, y: h.y, big: true });
              this.killPet(pet, h.type === "water" ? "drowned" : "burned");
            }
          } else if (h.type === "spikes") {
            const top = h.dir === "up" ? h.y - 26 : h.y;
            const bottom = h.dir === "up" ? h.y : h.y + 26;
            const cx = clamp(pet.x, h.x1, h.x2);
            const cy = clamp(pet.y, top, bottom);
            if (Math.hypot(pet.x - cx, pet.y - cy) < TUNING.petRadius + 1) this.killPet(pet, "spiked");
          }
        }
      }
      // Mood and gaze follow the nearest threat.
      let nearest = Infinity;
      let threat: Vec | undefined;
      for (const b of this.bees) {
        if (b.state !== "fly") continue;
        const d = dist(b, pet);
        if (d < nearest) {
          nearest = d;
          threat = b;
        }
      }
      for (const c of this.crocs) {
        const d = dist(c, pet) - 40;
        if (d < nearest) {
          nearest = d;
          threat = c;
        }
      }
      if (this.phase === "won") pet.mood = "happy";
      else if (pet.hurtT > 0) pet.mood = "hurt";
      else pet.mood = nearest < 230 ? "worried" : "idle";
      if (threat) {
        const d = normalize(sub(threat, pet));
        pet.look = { x: pet.look.x + (d.x - pet.look.x) * 0.15, y: pet.look.y + (d.y - pet.look.y) * 0.15 };
      } else {
        pet.look = { x: pet.look.x * 0.95, y: pet.look.y * 0.95 };
      }
    }
  }

  explode(at: Vec): void {
    this.events.push({ type: "explode", x: at.x, y: at.y });
    this.cutInk(at, TUNING.bombCut);
    const blast = TUNING.bombBlast;
    const push = (body: RAPIER.RigidBody, p: Vec, power: number) => {
      const d = dist(p, at);
      if (d > blast || !body.isDynamic()) return;
      const dir = normalize(sub(p, at));
      const k = (1 - d / blast) * power * body.mass();
      body.applyImpulse({ x: dir.x * k, y: (dir.y - 0.35) * k }, true);
    };
    // Ink centres can sit far from the blast; push from the nearest stroke point instead.
    for (const ink of this.inks) {
      let near: Vec = ink;
      let best = Infinity;
      for (const pt of this.inkWorldPoints(ink)) {
        const d = dist(pt, at);
        if (d < best) {
          best = d;
          near = pt;
        }
      }
      if (best > blast || !ink.body.isDynamic() || this.blocked(at, near, GROUP.TERRAIN)) continue;
      const dir = normalize(sub(near, at));
      const k = (1 - best / blast) * 9 * ink.body.mass();
      ink.body.applyImpulseAtPoint({ x: dir.x * k, y: (dir.y - 0.5) * k }, { x: toM(near.x), y: toM(near.y) }, true);
    }
    for (const prop of this.props) if (!prop.broken) push(prop.body, prop, 6);
    for (const b of this.boulders) if (b.alive) push(b.body, b, 5);
    for (const c of this.crocs) push(c.body, c, 6);
    for (const bee of this.bees) {
      if (bee.state === "dead") continue;
      if (dist(bee, at) < TUNING.bombKill) this.killBee(bee);
      else push(bee.body, bee, 9);
    }
    for (const pet of this.pets) {
      if (!pet.alive || dist(pet, at) > TUNING.bombHurt + TUNING.petRadius || this.shielded(at, pet)) continue;
      push(pet.body, pet, 7);
      this.damagePet(pet, at, "blast");
    }
  }

  killBee(bee: Bee): void {
    if (bee.state === "dead") return;
    bee.state = "dead";
    this.events.push({ type: "beeKilled", x: bee.x, y: bee.y });
    this.world.removeRigidBody(bee.body);
  }

  /** True if something in `mask` lies on the straight path from `from` to `to`. */
  blocked(from: Vec, to: Vec, mask: number): boolean {
    const d = dist(from, to);
    if (d < 4) return false;
    const dir = normalize(sub(to, from));
    const ray = new RAPIER.Ray({ x: toM(from.x), y: toM(from.y) }, dir);
    const hit = this.world.castRay(ray, toM(d - 3), true, undefined, groups(GROUP.TERRAIN, mask), undefined, undefined, (c) => ((c.collisionGroups() >>> 16) & mask) !== 0);
    return hit !== null;
  }

  /** True if ink or terrain sits between `from` and the pet. */
  shielded(from: Vec, pet: Pet): boolean {
    const d = dist(from, pet) - TUNING.petRadius;
    if (d <= 2) return false;
    const dir = normalize(sub(pet, from));
    const ray = new RAPIER.Ray({ x: toM(from.x), y: toM(from.y) }, dir);
    const hit = this.world.castRay(ray, toM(d), true, undefined, groups(GROUP.TERRAIN, GROUP.INK | GROUP.TERRAIN), undefined, undefined, (c) => {
      const member = c.collisionGroups() >>> 16;
      return (member & (GROUP.INK | GROUP.TERRAIN)) !== 0;
    });
    return hit !== null && hit.timeOfImpact * PPM > 6;
  }

  nearestPet(from: Vec): Pet | undefined {
    let best: Pet | undefined;
    let bestD = Infinity;
    for (const pet of this.pets) {
      if (!pet.alive) continue;
      const d = dist(pet, from);
      if (d < bestD) {
        bestD = d;
        best = pet;
      }
    }
    return best;
  }

  private cleanup(): void {
    for (const bee of this.bees) {
      if (bee.state === "leave" && (bee.y < -120 || bee.x < -120 || bee.x > VIEW_W + 120)) {
        bee.state = "dead";
        this.world.removeRigidBody(bee.body);
      }
    }
    for (const b of this.boulders) {
      if (b.alive && (b.y > VIEW_H + 200 || b.x < -200 || b.x > VIEW_W + 200)) {
        b.alive = false;
        this.world.removeRigidBody(b.body);
      }
    }
    if (this.bees.length > 160) {
      const live = this.bees.filter((b) => b.state !== "dead");
      this.bees.length = 0;
      this.bees.push(...live);
    }
  }

  clearHives(): void {
    for (const hive of this.hives) {
      const col = this.hiveColliders.get(hive);
      if (col) this.world.removeCollider(col, false);
    }
    this.hiveColliders.clear();
    this.hives.length = 0;
  }

  removeInk(ink: Ink): void {
    const i = this.inks.indexOf(ink);
    if (i < 0) return;
    this.inks.splice(i, 1);
    this.world.removeRigidBody(ink.body);
  }

  removeBomb(bomb: Bomb): void {
    bomb.alive = false;
    this.world.removeRigidBody(bomb.body);
  }

  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }


  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.world.free();
  }
}

function syncBody(target: { x: number; y: number; vx: number; vy: number }, body: RAPIER.RigidBody): void {
  const t = body.translation();
  const v = body.linvel();
  target.x = t.x * PPM;
  target.y = t.y * PPM;
  target.vx = v.x * PPM;
  target.vy = v.y * PPM;
}

function boxSamples(w: number, h: number): Vec[] {
  const hx = w / 2;
  const hy = h / 2;
  return [
    { x: -hx, y: -hy },
    { x: hx, y: -hy },
    { x: hx, y: hy },
    { x: -hx, y: hy },
    { x: 0, y: hy },
    { x: 0, y: -hy },
  ];
}

/** Transform local points by a pose, optionally inflating them outward by `grow` px. */
function transformed(points: readonly Vec[], x: number, y: number, angle: number, grow: number): Vec[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return points.map((p) => {
    let px = p.x;
    let py = p.y;
    if (grow) {
      const l = Math.hypot(px, py) || 1;
      px += (px / l) * grow;
      py += (py / l) * grow;
    }
    return { x: x + px * c - py * s, y: y + px * s + py * c };
  });
}
