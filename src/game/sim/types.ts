import type * as RAPIER from "@dimforge/rapier2d-deterministic/rapier.js";

import type { Vec } from "../core/math";
import type { BeeKind, PetKind, Rect } from "../levels/types";

export type BoosterId = "ink" | "steel" | "shield" | "spray" | "time";

export type Phase = "plan" | "survive" | "won" | "lost" | "intermission";

export type DeathReason = "stung" | "eaten" | "drowned" | "burned" | "spiked" | "fell" | "blast" | "crushed" | "tongue" | "impaled";

export type Mood = "idle" | "worried" | "hurt" | "happy" | "dead";

export interface Pet {
  body: RAPIER.RigidBody;
  kind: PetKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hearts: number;
  maxHearts: number;
  shield: number;
  invuln: number;
  alive: boolean;
  mood: Mood;
  /** Seconds the current hurt flash/shake has left. */
  hurtT: number;
  /** Where the pet is looking (unit-ish vector). */
  look: Vec;
  damageTaken: number;
}

export type BeeState = "fly" | "stun" | "leave" | "dead";
export type HornetMode = "approach" | "aim" | "dash" | "recover";

export interface Bee {
  id: number;
  body: RAPIER.RigidBody;
  kind: BeeKind;
  radius: number;
  state: BeeState;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  phase: number;
  orbitSign: 1 | -1;
  orbitT: number;
  stuckT: number;
  lastSpeed: number;
  stingCd: number;
  stunT: number;
  mode: HornetMode;
  modeT: number;
  dash: Vec;
  /** Seconds since the bee left the hive. */
  age: number;
}

export interface Ink {
  id: number;
  body: RAPIER.RigidBody;
  /** Stroke points relative to the body origin. */
  local: Vec[];
  fixed: boolean;
  x: number;
  y: number;
  angle: number;
  /** Endless mode: ink fades after a couple of waves. */
  wave: number;
  /** Pins this piece hangs from. */
  pins: Pin[];
}

export interface Prop {
  body: RAPIER.RigidBody;
  shape: { kind: "box"; w: number; h: number } | { kind: "ball"; r: number };
  style: string;
  role: "box" | "ball" | "seesaw" | "mover" | "raft";
  x: number;
  y: number;
  angle: number;
  mover?: { from: Vec; to: Vec; period: number };
  breakAt?: number;
  broken: boolean;
  buoyancy?: number;
  pivot?: Vec;
  samples: Vec[];
}

export interface Hive {
  x: number;
  y: number;
  hang: boolean;
  /** Remaining spawns: absolute times (s) and kinds. */
  queue: Array<{ t: number; kind: BeeKind }>;
  total: number;
  /** Visual pulse when bees emerge. */
  pulse: number;
}

export interface Croc {
  body: RAPIER.RigidBody;
  mode: "land" | "water";
  state: "idle" | "walk" | "lurk" | "leap" | "snap" | "recover";
  stateT: number;
  facing: 1 | -1;
  x: number;
  y: number;
  vx: number;
  vy: number;
  jaw: number;
  delay: number;
  water?: Rect;
  samples: Vec[];
}

export interface Frog {
  x: number;
  y: number;
  facing: 1 | -1;
  state: "idle" | "aim" | "shoot" | "retract";
  stateT: number;
  next: number;
  interval: number;
  aim: Vec;
  /** Current tongue tip in world space while shooting. */
  tip: Vec;
  reach: number;
  hitPet: boolean;
}

export interface Bomb {
  body: RAPIER.RigidBody;
  x: number;
  y: number;
  angle: number;
  fuse: number;
  maxFuse: number;
  alive: boolean;
}

export interface Icicle {
  body: RAPIER.RigidBody;
  /** Body centre; the tip points straight down `ICICLE_HALF` below it. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  cutCd: number;
  alive: boolean;
}

export interface Boulder {
  body: RAPIER.RigidBody;
  r: number;
  x: number;
  y: number;
  angle: number;
  alive: boolean;
  cutCd: number;
}

export interface Pin {
  x: number;
  y: number;
  attached: boolean;
}

export type SimEvent =
  | { type: "release" }
  | { type: "sting"; x: number; y: number }
  | { type: "hurt"; x: number; y: number; source: string }
  | { type: "shieldPop"; x: number; y: number }
  | { type: "bump"; x: number; y: number; power: number }
  | { type: "spawn"; x: number; y: number }
  | { type: "explode"; x: number; y: number }
  | { type: "beeKilled"; x: number; y: number }
  | { type: "chomp"; x: number; y: number }
  | { type: "leap"; x: number; y: number }
  | { type: "splash"; x: number; y: number; big: boolean }
  | { type: "sizzle"; x: number; y: number }
  | { type: "tongue"; x: number; y: number; hit: boolean }
  | { type: "spray"; x: number; y: number }
  | { type: "pin"; x: number; y: number }
  | { type: "crumble"; x: number; y: number; w: number; h: number }
  | { type: "inkCut"; x: number; y: number }
  | { type: "shatter"; x: number; y: number }
  | { type: "tick"; n: number }
  | { type: "warn"; x: number; y: number; what: string }
  | { type: "won" }
  | { type: "lost"; reason: DeathReason }
  | { type: "wave"; n: number };

export interface Outcome {
  won: boolean;
  reason?: DeathReason;
  stars: number;
  noDamage: boolean;
  underPar: boolean;
  inkUsed: number;
  par: number;
}
