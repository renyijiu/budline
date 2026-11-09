import type { Vec } from "../core/math";

export type PetKind = "hamster" | "chick" | "piglet" | "bunny" | "panda" | "kitten";

export type TerrainStyle = "grass" | "rock" | "wood" | "sand" | "basalt" | "ice" | "snow" | "candy" | "cloud" | "bamboo";

export interface TerrainShape {
  /** Convex polygon, any winding. */
  poly: Vec[];
  style: TerrainStyle;
  /** Low-friction surfaces (ice) make pets and ink slide. */
  friction?: number;
  /** Bamboo fences: solid for bodies, but frog tongues pass through the gaps. */
  porous?: boolean;
}

export interface PetSpawn {
  x: number;
  y: number;
}

export type BeeKind = "bee" | "hornet";

export interface BeeWave {
  /** Seconds after the stroke is released. */
  at: number;
  count: number;
  kind?: BeeKind;
  /** Seconds over which the wave leaves the hive. */
  over?: number;
}

export interface HiveDef {
  x: number;
  y: number;
  waves: BeeWave[];
  /** Hanging hives are drawn on a branch; others sit in the scene. */
  hang?: boolean;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Hazard =
  | ({ type: "water" } & Rect)
  | ({ type: "lava" } & Rect)
  | { type: "spikes"; x1: number; x2: number; y: number; dir: "up" | "down" }
  | ({ type: "wind"; fx: number; fy: number; period?: number; duty?: number; phase?: number } & Rect);

export type PropDef =
  | {
      type: "box";
      x: number;
      y: number;
      w: number;
      h: number;
      angle?: number;
      dynamic?: boolean;
      style?: TerrainStyle;
      /** Survive-time (s) at which a static box crumbles away. */
      breakAt?: number;
    }
  | { type: "ball"; x: number; y: number; r: number; dynamic?: boolean }
  | { type: "seesaw"; x: number; y: number; w: number; h?: number; angle?: number; icy?: boolean }
  | { type: "mover"; x: number; y: number; w: number; h: number; to: Vec; period: number; style?: TerrainStyle }
  | { type: "raft"; x: number; y: number; w: number; h: number; /** Lower values sink and tilt more under load. */ buoyancy?: number };

export type EventDef =
  | { type: "bomb"; at: number; x: number; y?: number; vx?: number; fuse?: number }
  | { type: "boulder"; at: number; x: number; y: number; vx: number; vy?: number; r?: number }
  /** An icicle hanging from a ceiling with its base at (x, y); it drops at `at`. */
  | { type: "icicle"; at: number; x: number; y: number };

export type EnemyDef =
  | { type: "croc"; x: number; y: number; mode: "land" | "water"; delay?: number }
  | { type: "frog"; x: number; y: number; delay?: number; interval?: number };

export interface LevelDef {
  id: string;
  world: number;
  index: number;
  name: string;
  /** One-line hint shown in the plan phase. */
  tip: string;
  time: number;
  ink: number;
  /** Ink at or under which the third star is awarded. */
  par: number;
  strokes?: number;
  hearts?: number;
  terrain: TerrainShape[];
  pets: PetSpawn[];
  hives: HiveDef[];
  hazards?: Hazard[];
  props?: PropDef[];
  events?: EventDef[];
  enemies?: EnemyDef[];
  pins?: Vec[];
  noDraw?: Rect[];
  /** Reference strokes: drive the hint and the automated solvability check. */
  solution: Vec[][];
  /** Tutorial levels where a plain dome is the intended answer. Every other level must defeat it. */
  naiveOk?: boolean;
  /** Tempting wrong answers that must lose; keeps each level's twist honest. */
  pitfalls?: Array<{ name: string; strokes: Vec[][] }>;
  seed?: number;
}

export interface WorldDef {
  id: number;
  name: string;
  subtitle: string;
  theme: WorldTheme;
  unlockPet: PetKind;
}

export interface WorldTheme {
  skyTop: string;
  skyBottom: string;
  far: string;
  near: string;
  accent: string;
  /** Decorative silhouettes drawn in the background. */
  scenery: "meadow" | "pond" | "volcano" | "snow" | "night";
}
