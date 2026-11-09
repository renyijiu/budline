import * as RAPIER from "@dimforge/rapier2d-deterministic/rapier.js";

import { GRAVITY_PX, GROUP, PPM, TUNING, VIEW_H, groups, toM } from "../core/config";
import { clamp, dist, normalize, pointSegmentDistance, sub, type Vec } from "../core/math";
import type { Sim } from "./Sim";
import type { Bomb, Boulder, Croc, Frog, Icicle } from "./types";

export const CROC_HALF = { x: 62, y: 22 } as const;
const FROG_RANGE = 560;

function mouthOf(croc: Croc): Vec {
  return { x: croc.x + croc.facing * (CROC_HALF.x + 4), y: croc.y - 6 };
}

function setState(croc: Croc, state: Croc["state"]): void {
  croc.state = state;
  croc.stateT = 0;
}

export function updateCroc(sim: Sim, croc: Croc, dt: number): void {
  croc.stateT += dt;
  const body = croc.body;
  const m = body.mass();
  if (sim.phase !== "survive") {
    croc.jaw = Math.max(0, croc.jaw - dt * 4);
    if (croc.state === "leap" || croc.state === "snap") setState(croc, "recover");
    return;
  }
  const pet = sim.nearestPet(croc);
  if (!pet) return;
  const dx = pet.x - croc.x;
  const dy = pet.y - croc.y;
  const g = GRAVITY_PX;

  const pushX = (targetVx: number, gain: number) => {
    const ax = clamp((targetVx - croc.vx) * gain, -1300, 1300);
    body.applyImpulse({ x: (ax / PPM) * m * dt, y: 0 }, true);
  };

  const tryBite = (range: number) => {
    const mouth = mouthOf(croc);
    if (dist(mouth, pet) < TUNING.petRadius + range && !sim.shielded(mouth, pet)) {
      sim.damagePet(pet, croc, "eaten", true);
      sim.events.push({ type: "chomp", x: pet.x, y: pet.y });
      return true;
    }
    return false;
  };

  switch (croc.state) {
    case "idle":
      if (croc.stateT >= croc.delay) setState(croc, "walk");
      return;
    case "walk": {
      croc.facing = dx >= 0 ? 1 : -1;
      croc.jaw = Math.max(0, croc.jaw - dt * 3);
      if (croc.mode === "land") {
        pushX(croc.facing * 115, 10);
        // Shoved against something it cannot move: chomp at it.
        const stalled = croc.stateT > 0.8 && Math.abs(croc.vx) < 25;
        if ((Math.abs(dx) < CROC_HALF.x + 72 && Math.abs(dy) < 85) || stalled) setState(croc, "snap");
        else if (dy < -80 && Math.abs(dx) < 260 && Math.abs(croc.vy) < 30 && croc.stateT > 1) setState(croc, "lurk");
      } else {
        const w = croc.water;
        const target = w ? clamp(pet.x, w.x + CROC_HALF.x, w.x + w.w - CROC_HALF.x) : pet.x;
        pushX(clamp((target - croc.x) * 2, -120, 120), 8);
        if (Math.abs(dx) < 230 && (!w || pet.y < w.y) && croc.stateT > 1.1) {
          setState(croc, "lurk");
          sim.events.push({ type: "warn", x: croc.x, y: croc.y, what: "croc" });
        }
      }
      return;
    }
    case "lurk": {
      croc.facing = dx >= 0 ? 1 : -1;
      croc.jaw = Math.min(0.5, croc.jaw + dt * 2);
      pushX(0, 3);
      const windup = croc.mode === "water" ? 0.85 : 0.5;
      if (croc.stateT >= windup) {
        const rise = Math.max(70, croc.y - pet.y + 40);
        const vy = -Math.sqrt(2 * g * rise);
        const t = -vy / g;
        const vx = clamp((dx - croc.facing * CROC_HALF.x * 0.6) / t, -520, 520);
        body.setLinvel({ x: toM(vx), y: toM(vy) }, true);
        setState(croc, "leap");
        sim.events.push({ type: "leap", x: croc.x, y: croc.y });
        if (croc.mode === "water") sim.events.push({ type: "splash", x: croc.x, y: croc.water?.y ?? croc.y, big: false });
      }
      return;
    }
    case "leap": {
      croc.jaw = Math.min(1, croc.jaw + dt * 6);
      if (tryBite(20)) {
        setState(croc, "recover");
        return;
      }
      const landed = croc.mode === "water" ? croc.water !== undefined && croc.y > croc.water.y && croc.vy > 0 : Math.abs(croc.vy) < 15;
      if (croc.stateT > 0.3 && landed) {
        if (croc.mode === "water") sim.events.push({ type: "splash", x: croc.x, y: croc.water!.y, big: false });
        sim.events.push({ type: "chomp", x: mouthOf(croc).x, y: mouthOf(croc).y });
        setState(croc, "recover");
      }
      return;
    }
    case "snap": {
      croc.jaw = Math.min(1, croc.stateT / 0.3);
      pushX(croc.facing * 70, 10);
      if (croc.stateT >= 0.38) {
        croc.jaw = 0;
        if (!tryBite(24)) {
          sim.events.push({ type: "chomp", x: mouthOf(croc).x, y: mouthOf(croc).y });
          tossInk(sim, croc);
        }
        setState(croc, "recover");
      }
      return;
    }
    case "recover": {
      croc.jaw = Math.max(0, croc.jaw - dt * 5);
      // Right after a chomp the croc lunges into whatever gap it made, then backs off.
      if (croc.mode === "land") {
        if (croc.stateT < 0.6) {
          pushX(croc.facing * 240, 18);
          tryBite(18);
        } else pushX(-croc.facing * 50, 8);
      }
      if (croc.stateT >= (croc.mode === "water" ? 1.4 : 0.75)) setState(croc, "walk");
      return;
    }
  }
}

/** A chomp that catches ink yanks it up and toward the croc's side — braced ink barely moves. */
function tossInk(sim: Sim, croc: Croc): void {
  const mouth = mouthOf(croc);
  for (const ink of sim.inks) {
    if (ink.fixed) continue;
    let hit: Vec | undefined;
    let best = 46;
    for (const pt of sim.inkWorldPoints(ink)) {
      const d = dist(pt, mouth);
      if (d < best) {
        best = d;
        hit = pt;
      }
    }
    if (!hit) continue;
    const m = ink.body.mass();
    ink.body.applyImpulseAtPoint({ x: -croc.facing * m * 1.5, y: -m * 7 }, { x: toM(hit.x), y: toM(hit.y) }, true);
    sim.events.push({ type: "bump", x: hit.x, y: hit.y, power: 1 });
  }
}

export function updateFrog(sim: Sim, frog: Frog, dt: number, self: RAPIER.Collider | undefined): void {
  frog.stateT += dt;
  if (sim.phase !== "survive") {
    frog.state = "idle";
    frog.tip = { x: frog.x, y: frog.y };
    return;
  }
  const pet = sim.nearestPet(frog);
  if (!pet) return;
  const mouth = { x: frog.x + frog.facing * 14, y: frog.y - 8 };
  if (frog.state === "idle" || frog.state === "aim") frog.facing = pet.x >= frog.x ? 1 : -1;

  switch (frog.state) {
    case "idle":
      frog.tip = mouth;
      if (sim.time >= frog.next) {
        frog.state = "aim";
        frog.stateT = 0;
        frog.aim = normalize(sub(pet, mouth));
        sim.events.push({ type: "warn", x: frog.x, y: frog.y, what: "frog" });
      }
      return;
    case "aim":
      if (frog.stateT < 0.5) frog.aim = normalize(sub(pet, mouth));
      frog.tip = mouth;
      if (frog.stateT >= 0.8) {
        const ray = new RAPIER.Ray({ x: toM(mouth.x), y: toM(mouth.y) }, frog.aim);
        const hit = sim.world.castRay(
          ray,
          toM(FROG_RANGE),
          true,
          undefined,
          groups(GROUP.TERRAIN, GROUP.TERRAIN | GROUP.INK | GROUP.PROP | GROUP.HIVE),
          self,
          undefined,
          (c) => ((c.collisionGroups() >>> 16) & (GROUP.TERRAIN | GROUP.INK | GROUP.PROP | GROUP.HIVE)) !== 0,
        );
        const wall = hit ? hit.timeOfImpact * PPM : FROG_RANGE;
        // Where along the ray does the pet sit?
        const rel = sub(pet, mouth);
        const along = rel.x * frog.aim.x + rel.y * frog.aim.y;
        const off = Math.abs(rel.x * frog.aim.y - rel.y * frog.aim.x);
        const petT = off < TUNING.petRadius && along > 0 ? along - Math.sqrt(TUNING.petRadius ** 2 - off * off) : Infinity;
        frog.hitPet = petT < wall && petT <= FROG_RANGE;
        frog.reach = frog.hitPet ? petT : wall;
        frog.state = "shoot";
        frog.stateT = 0;
      }
      return;
    case "shoot": {
      const k = Math.min(1, frog.stateT / 0.12);
      frog.tip = { x: mouth.x + frog.aim.x * frog.reach * k, y: mouth.y + frog.aim.y * frog.reach * k };
      if (k >= 1) {
        if (frog.hitPet) {
          sim.damagePet(pet, frog, "tongue");
          pet.body.applyImpulse({ x: -frog.aim.x * pet.body.mass() * 1.6, y: -frog.aim.y * pet.body.mass() * 1.6 }, true);
        }
        sim.events.push({ type: "tongue", x: frog.tip.x, y: frog.tip.y, hit: frog.hitPet });
        frog.state = "retract";
        frog.stateT = 0;
      }
      return;
    }
    case "retract": {
      const k = 1 - Math.min(1, frog.stateT / 0.22);
      frog.tip = { x: mouth.x + frog.aim.x * frog.reach * k, y: mouth.y + frog.aim.y * frog.reach * k };
      if (k <= 0) {
        frog.state = "idle";
        frog.stateT = 0;
        frog.next = sim.time + frog.interval;
      }
      return;
    }
  }
}

export function updateBomb(sim: Sim, bomb: Bomb, dt: number): void {
  bomb.fuse -= dt;
  for (const pet of sim.pets) {
    if (pet.alive && dist(bomb, pet) < TUNING.bombRadius + TUNING.petRadius + 2) bomb.fuse = Math.min(bomb.fuse, 0);
  }
  if (bomb.y > VIEW_H + 120) {
    sim.removeBomb(bomb);
    return;
  }
  if (bomb.fuse <= 0) {
    sim.removeBomb(bomb);
    sim.explode(bomb);
  }
}

/**
 * Snaps the first stroke segment that `probe` (moving at vx, vy px/s) is about to strike faster than
 * `threshold` along the segment's normal. Glancing contact leaves ink intact. Runs before the physics
 * step, so whatever hit it keeps moving through the gap instead of stopping.
 */
function snapInkAhead(sim: Sim, probe: Vec, vx: number, vy: number, probeRadius: number, threshold: number, cutRadius: number, dt: number): boolean {
  const speed = Math.hypot(vx, vy);
  if (speed < threshold) return false;
  const reach = probeRadius + TUNING.inkRadius + 3 + speed * dt;
  for (const ink of sim.inks) {
    if (ink.fixed) continue;
    const pts = sim.inkWorldPoints(ink);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      if (pointSegmentDistance(probe, a, b) > reach) continue;
      const sx = b.x - a.x;
      const sy = b.y - a.y;
      const sl = Math.hypot(sx, sy) || 1;
      const t = Math.max(0, Math.min(1, ((probe.x - a.x) * sx + (probe.y - a.y) * sy) / (sl * sl)));
      const hit = { x: a.x + sx * t, y: a.y + sy * t };
      if ((hit.x - probe.x) * vx + (hit.y - probe.y) * vy <= 0) continue;
      if (Math.abs((vx * -sy + vy * sx) / sl) < threshold) continue;
      sim.cutInk(hit, cutRadius, false);
      return true;
    }
  }
  return false;
}

/** A boulder hitting ink head-on ploughs a gap through it. */
export function preStepBoulder(sim: Sim, boulder: Boulder, dt: number): void {
  boulder.cutCd -= dt;
  if (boulder.cutCd > 0) return;
  const v = boulder.body.linvel();
  if (snapInkAhead(sim, boulder, v.x * PPM, v.y * PPM, boulder.r, TUNING.boulderCutSpeed, boulder.r + 20, dt)) boulder.cutCd = 0.05;
}

export function updateBoulder(sim: Sim, boulder: Boulder): void {
  const v = boulder.body.linvel();
  for (const pet of sim.pets) {
    if (!pet.alive) continue;
    if (dist(boulder, pet) > boulder.r + TUNING.petRadius + 3) continue;
    const rel = Math.hypot(v.x * PPM - pet.vx, v.y * PPM - pet.vy);
    if (rel > TUNING.boulderHurtSpeed) sim.damagePet(pet, boulder, "crushed", true);
  }
}

export const ICICLE_HALF = { w: 15, h: 46 } as const;

function icicleTip(icicle: Icicle): Vec {
  return { x: icicle.x, y: icicle.y + ICICLE_HALF.h };
}

/** An icicle tip striking ink head-on snaps it; a steep roof only makes it glance off. */
export function preStepIcicle(sim: Sim, icicle: Icicle, dt: number): void {
  icicle.cutCd -= dt;
  if (icicle.cutCd > 0) return;
  if (snapInkAhead(sim, icicleTip(icicle), icicle.vx, icicle.vy, 1, TUNING.icicleCutSpeed, 34, dt)) icicle.cutCd = 0.05;
}

/** After the step: impale a pet it touches while moving; shatter once it comes to rest. */
export function updateIcicle(sim: Sim, icicle: Icicle, dt: number): void {
  icicle.age += dt;
  const speed = Math.hypot(icicle.vx, icicle.vy);
  const tip = icicleTip(icicle);
  const top = { x: icicle.x, y: icicle.y - ICICLE_HALF.h };
  for (const pet of sim.pets) {
    if (!pet.alive || speed < 60) continue;
    if (pointSegmentDistance(pet, top, tip) < TUNING.petRadius + 6) sim.damagePet(pet, tip, "impaled", true);
  }
  if ((icicle.age > 0.25 && speed < 70) || icicle.y > VIEW_H + 120) sim.shatterIcicle(icicle);
}
