import * as RAPIER from "@dimforge/rapier2d-deterministic/rapier.js";

import { GROUP, PPM, TUNING, groups, toM } from "../core/config";
import { clamp, lerp, normalize, perp, rotate, type Vec } from "../core/math";
import type { BeeKind } from "../levels/types";
import type { Sim } from "./Sim";
import type { Bee } from "./types";

export const BEE_RADIUS: Record<BeeKind, number> = { bee: TUNING.beeRadius, hornet: TUNING.hornetRadius };

const BEE_ACCEL = 1350;
const HORNET_ACCEL = 800;

export function spawnBee(sim: Sim, id: number, kind: BeeKind, pos: Vec, vel: Vec): Bee {
  const r = BEE_RADIUS[kind];
  const body = sim.world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(toM(pos.x), toM(pos.y))
      .setLinvel(toM(vel.x), toM(vel.y))
      .setGravityScale(0)
      .lockRotations()
      .setLinearDamping(0.5)
      .setCanSleep(false),
  );
  sim.world.createCollider(
    RAPIER.ColliderDesc.ball(toM(r))
      .setDensity(kind === "hornet" ? TUNING.hornetDensity : TUNING.beeDensity)
      .setFriction(0.02)
      .setRestitution(0.35)
      .setCollisionGroups(groups(GROUP.BEE, GROUP.TERRAIN | GROUP.INK | GROUP.PET | GROUP.BEE | GROUP.PROP | GROUP.NET)),
    body,
  );
  return {
    id,
    body,
    kind,
    radius: r,
    state: "fly",
    x: pos.x,
    y: pos.y,
    vx: vel.x,
    vy: vel.y,
    facing: vel.x >= 0 ? 1 : -1,
    phase: sim.rng.range(0, Math.PI * 2),
    orbitSign: sim.rng.sign(),
    orbitT: 0,
    stuckT: 0,
    lastSpeed: Math.hypot(vel.x, vel.y),
    stingCd: 0.2,
    stunT: 0,
    mode: "approach",
    modeT: 0,
    dash: { x: 0, y: 0 },
    age: 0,
  };
}

export function updateBee(sim: Sim, bee: Bee, dt: number): void {
  if (bee.state === "dead") return;
  bee.age += dt;
  bee.stingCd -= dt;
  bee.modeT += dt;

  if (bee.state === "leave") {
    steer(bee, { x: bee.facing * 140, y: -480 }, 1600, dt);
    return;
  }
  if (bee.state === "stun") {
    bee.stunT -= dt;
    if (bee.stunT <= 0) {
      bee.state = "fly";
      bee.body.setGravityScale(0, true);
    } else {
      bee.body.setGravityScale(0.18, true);
      return;
    }
  }

  const pet = sim.nearestPet(bee) ?? sim.pets[0];
  if (!pet) return;
  const tx = pet.x - bee.x;
  const ty = pet.y - bee.y;
  const d = Math.hypot(tx, ty) || 1;
  const dir = { x: tx / d, y: ty / d };

  if (!pet.alive) {
    // The pet is gone: circle it smugly.
    const around = normalize({ x: perp(dir).x * bee.orbitSign + dir.x * (d - 110) * 0.01, y: perp(dir).y * bee.orbitSign + dir.y * (d - 110) * 0.01 });
    steer(bee, { x: around.x * 160, y: around.y * 160 }, BEE_ACCEL, dt);
    return;
  }

  const progress = clamp(sim.time / Math.max(1, sim.duration), 0, 1);

  if (bee.kind === "hornet") {
    updateHornet(sim, bee, dir, d, progress, dt);
    return;
  }

  const speed = lerp(TUNING.beeSpeed, TUNING.beeSpeedLate, progress * progress);
  let want = rotate(dir, Math.sin(bee.age * 2.7 + bee.phase) * 0.5);
  want = searchForGap(sim, bee, dir, d, want, dt);
  want = normalize(addSeparation(sim, bee, want));
  steer(bee, { x: want.x * speed, y: want.y * speed }, BEE_ACCEL, dt);
}

function updateHornet(sim: Sim, bee: Bee, dir: Vec, d: number, progress: number, dt: number): void {
  switch (bee.mode) {
    case "approach": {
      let want = rotate(dir, Math.sin(bee.age * 1.9 + bee.phase) * 0.35);
      want = searchForGap(sim, bee, dir, d, want, dt);
      const hold = d < 240 ? -0.4 : 1;
      steer(bee, { x: want.x * TUNING.hornetSpeed * hold, y: want.y * TUNING.hornetSpeed * hold }, HORNET_ACCEL, dt);
      if (d < 320 && bee.modeT > 0.9) {
        bee.mode = "aim";
        bee.modeT = 0;
        bee.dash = dir;
        sim.events.push({ type: "warn", x: bee.x, y: bee.y, what: "hornet" });
      }
      return;
    }
    case "aim": {
      if (bee.modeT < TUNING.hornetAim - 0.2) bee.dash = dir;
      steer(bee, { x: -bee.dash.x * 40, y: -bee.dash.y * 40 + Math.sin(bee.age * 18) * 30 }, HORNET_ACCEL * 2, dt);
      if (bee.modeT >= TUNING.hornetAim) {
        bee.mode = "dash";
        bee.modeT = 0;
      }
      return;
    }
    case "dash": {
      const s = TUNING.hornetDashSpeed * (0.9 + progress * 0.2);
      steer(bee, { x: bee.dash.x * s, y: bee.dash.y * s }, 6000, dt);
      if (bee.modeT >= TUNING.hornetDash) {
        bee.mode = "recover";
        bee.modeT = 0;
      }
      return;
    }
    case "recover": {
      steer(bee, { x: -bee.dash.x * 90, y: -bee.dash.y * 90 - 40 }, HORNET_ACCEL, dt);
      if (bee.modeT >= TUNING.hornetRecover) {
        bee.mode = "approach";
        bee.modeT = 0.5;
      }
      return;
    }
  }
}

/** When a bee stops making progress it slides sideways along whatever blocks it, probing for gaps. */
function searchForGap(sim: Sim, bee: Bee, dir: Vec, d: number, want: Vec, dt: number): Vec {
  const speed = Math.hypot(bee.vx, bee.vy);
  if (bee.orbitT > 0) {
    bee.orbitT -= dt;
    const side = perp(dir);
    return normalize({ x: side.x * bee.orbitSign + dir.x * 0.3, y: side.y * bee.orbitSign + dir.y * 0.3 });
  }
  if (d > TUNING.petRadius + 48 && speed < 90) bee.stuckT += dt;
  else bee.stuckT = Math.max(0, bee.stuckT - dt * 0.5);
  if (bee.stuckT > 0.3) {
    bee.stuckT = 0;
    bee.orbitT = sim.rng.range(0.6, 1.5);
    // Prefer to keep circling the same way, but sometimes switch.
    if (sim.rng.next() < 0.35) bee.orbitSign = bee.orbitSign === 1 ? -1 : 1;
  }
  return want;
}

function addSeparation(sim: Sim, bee: Bee, want: Vec): Vec {
  let sx = 0;
  let sy = 0;
  const range = bee.radius * 2.8;
  const range2 = range * range;
  for (const other of sim.bees) {
    if (other === bee || other.state !== "fly") continue;
    const dx = bee.x - other.x;
    const dy = bee.y - other.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > range2 || d2 < 1e-6) continue;
    const dd = Math.sqrt(d2);
    const k = (1 - dd / range) * 0.9;
    sx += (dx / dd) * k;
    sy += (dy / dd) * k;
  }
  return { x: want.x + sx, y: want.y + sy };
}

/** Velocity-matching steering with a capped acceleration, so bees are nimble but push weakly. */
function steer(bee: Bee, desired: Vec, accelCap: number, dt: number): void {
  let ax = (desired.x - bee.vx) * TUNING.beeAgility;
  let ay = (desired.y - bee.vy) * TUNING.beeAgility;
  const a = Math.hypot(ax, ay);
  if (a > accelCap) {
    ax = (ax / a) * accelCap;
    ay = (ay / a) * accelCap;
  }
  const m = bee.body.mass();
  bee.body.applyImpulse({ x: (ax / PPM) * m * dt, y: (ay / PPM) * m * dt }, true);
}
