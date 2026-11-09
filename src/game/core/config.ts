/** Logical portrait canvas. All gameplay coordinates are in these pixels. */
export const VIEW_W = 720;
export const VIEW_H = 1280;

/** Pixels per physics metre. Rapier runs in metres; the game speaks pixels. */
export const PPM = 50;
export const DT = 1 / 60;
export const GRAVITY_PX = 1150;

export const TUNING = {
  inkRadius: 7,
  inkDensity: 1.6,
  inkFriction: 0.9,
  minStrokeLength: 24,
  strokeSampleSpacing: 5,
  strokeSimplifyEpsilon: 1.6,
  pinRadius: 18,

  petRadius: 34,
  petDensity: 1.1,
  petFriction: 1.4,
  petInvulnerable: 0.7,
  petHearts: 3,

  beeRadius: 11,
  beeDensity: 1.1,
  beeSpeed: 235,
  beeSpeedLate: 330,
  beeAgility: 5.2,
  beeKnockback: 340,
  beeStingCooldown: 0.55,

  hornetRadius: 17,
  hornetDensity: 4.6,
  hornetSpeed: 150,
  hornetDashSpeed: 720,
  hornetAim: 0.75,
  hornetDash: 0.42,
  hornetRecover: 0.9,

  bombRadius: 20,
  bombBlast: 175,
  bombKill: 120,
  bombHurt: 105,
  /** Ink within this distance of a blast is destroyed. */
  bombCut: 64,

  boulderRadius: 34,
  boulderHurtSpeed: 100,
  /** A boulder hitting ink head-on faster than this snaps it. */
  boulderCutSpeed: 300,
  /** An icicle tip striking ink faster than this (along the ink's normal) snaps it. */
  icicleCutSpeed: 320,

  sprayRadius: 150,
  sprayStun: 2.2,
  shieldHits: 3,
  timeBoosterCut: 3,
  inkBoosterBonus: 0.45,
} as const;

/** Collision groups: high 16 bits = membership, low 16 bits = filter. */
export const GROUP = {
  TERRAIN: 0x0001,
  INK: 0x0002,
  PET: 0x0004,
  BEE: 0x0008,
  PROP: 0x0010,
  CROC: 0x0020,
  HIVE: 0x0040,
  NET: 0x0080,
} as const;

export function groups(member: number, filter: number): number {
  return ((member & 0xffff) << 16) | (filter & 0xffff);
}

export const toM = (px: number): number => px / PPM;
