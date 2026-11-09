import type { PetKind } from "../levels/types";
import type { Mood } from "../sim/types";

export const OUTLINE = "#3b2a40";
export const INK_COLOR = "#4b3fd8";
export const INK_DARK = "#241b63";
export const INK_SHINE = "#8f86ff";

type Ctx = CanvasRenderingContext2D;

export function circle(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

export function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

function fillStroke(ctx: Ctx, fill: string, width = 4): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = width;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
}

export const PET_INFO: Record<PetKind, { name: string; body: string; belly: string; accent: string; blurb: string }> = {
  hamster: { name: "团团", body: "#f4b26b", belly: "#fff1d6", accent: "#f59a9a", blurb: "圆滚滚的仓鼠，最爱瓜子。" },
  chick: { name: "啾啾", body: "#ffd84a", belly: "#fff6b8", accent: "#ff9a3c", blurb: "刚破壳的小鸡，胆子比芝麻还小。" },
  piglet: { name: "噗噗", body: "#ffb3c4", belly: "#ffdbe4", accent: "#ff7f9e", blurb: "爱打滚的小猪，被蜇了会哼哼。" },
  bunny: { name: "糯米", body: "#f6f2ff", belly: "#ffffff", accent: "#ffb6cf", blurb: "耳朵很长的兔子，跑得不算快。" },
  panda: { name: "墩墩", body: "#ffffff", belly: "#ffffff", accent: "#2f2b3a", blurb: "竹林里来的熊猫宝宝，憨憨的。" },
  kitten: { name: "咪咪", body: "#ffc98b", belly: "#fff0dc", accent: "#e8925a", blurb: "橘色小猫，好奇心旺盛。" },
};

export interface PetPose {
  kind: PetKind;
  mood: Mood;
  look: { x: number; y: number };
  t: number;
  /** >1 stretches tall, <1 squashes. */
  squash: number;
  blink: boolean;
  shake: number;
}

/** Draws a pet centred on (0,0); the caller translates. Visual radius ~40. */
export function drawPet(ctx: Ctx, pose: PetPose): void {
  const info = PET_INFO[pose.kind];
  const R = 40;
  ctx.save();
  if (pose.shake > 0) ctx.translate(Math.sin(pose.t * 70) * 4 * pose.shake, 0);
  const sy = pose.squash;
  const sx = 1 / Math.sqrt(sy);
  ctx.translate(0, R * (1 - sy));
  ctx.scale(sx, sy);

  // Ears / back features
  drawEars(ctx, pose.kind, info, pose.t, pose.mood);

  // Feet
  ellipse(ctx, -17, R - 4, 11, 7);
  fillStroke(ctx, shade(info.body, -18), 3.5);
  ellipse(ctx, 17, R - 4, 11, 7);
  fillStroke(ctx, shade(info.body, -18), 3.5);

  // Body
  circle(ctx, 0, 0, R);
  fillStroke(ctx, info.body, 4.5);
  ctx.save();
  circle(ctx, 0, 0, R - 2.5);
  ctx.clip();
  ellipse(ctx, 0, 18, 28, 22);
  ctx.fillStyle = info.belly;
  ctx.fill();
  if (pose.kind === "kitten") {
    ctx.strokeStyle = shade(info.body, -28);
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    for (const dx of [-10, 0, 10]) {
      ctx.beginPath();
      ctx.moveTo(dx, -R);
      ctx.lineTo(dx * 1.1, -R + 14);
      ctx.stroke();
    }
  }
  // top highlight
  ellipse(ctx, -14, -22, 12, 7, -0.5);
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fill();
  ctx.restore();

  if (pose.kind === "panda") {
    ctx.fillStyle = info.accent;
    ellipse(ctx, -14, -4, 10, 12, 0.5);
    ctx.fill();
    ellipse(ctx, 14, -4, 10, 12, -0.5);
    ctx.fill();
  }

  // Cheeks
  ctx.fillStyle = pose.mood === "hurt" ? "rgba(255,90,90,0.55)" : "rgba(255,120,140,0.45)";
  ellipse(ctx, -25, 9, 7, 4.5);
  ctx.fill();
  ellipse(ctx, 25, 9, 7, 4.5);
  ctx.fill();

  drawFace(ctx, pose);
  drawFrontFeature(ctx, pose.kind, info, pose.mood);
  ctx.restore();
}

function drawEars(ctx: Ctx, kind: PetKind, info: (typeof PET_INFO)[PetKind], t: number, mood: Mood): void {
  const droop = mood === "worried" || mood === "hurt" || mood === "dead" ? 0.35 : 0;
  switch (kind) {
    case "hamster":
      for (const s of [-1, 1]) {
        circle(ctx, s * 25, -29, 11);
        fillStroke(ctx, info.body, 4);
        circle(ctx, s * 25, -29, 5.5);
        ctx.fillStyle = info.accent;
        ctx.fill();
      }
      return;
    case "panda":
      for (const s of [-1, 1]) {
        circle(ctx, s * 27, -28, 11);
        fillStroke(ctx, info.accent, 4);
      }
      return;
    case "piglet":
    case "kitten":
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 12, -36);
        ctx.lineTo(s * (34 + droop * 6), -48 + droop * 18);
        ctx.lineTo(s * 36, -18);
        ctx.closePath();
        fillStroke(ctx, info.body, 4);
        ctx.beginPath();
        ctx.moveTo(s * 18, -32);
        ctx.lineTo(s * (31 + droop * 5), -41 + droop * 15);
        ctx.lineTo(s * 32, -22);
        ctx.closePath();
        ctx.fillStyle = kind === "piglet" ? info.accent : "#ffb6cf";
        ctx.fill();
      }
      return;
    case "bunny":
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(s * 14, -32);
        ctx.rotate(s * (0.18 + droop + Math.sin(t * 3 + s) * 0.04));
        ellipse(ctx, 0, -26, 10, 28);
        fillStroke(ctx, info.body, 4);
        ellipse(ctx, 0, -24, 4.5, 19);
        ctx.fillStyle = info.accent;
        ctx.fill();
        ctx.restore();
      }
      return;
    case "chick":
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-2, -38);
      ctx.quadraticCurveTo(-8, -54, 4, -56);
      ctx.moveTo(3, -39);
      ctx.quadraticCurveTo(6, -52, 14, -50);
      ctx.stroke();
      for (const s of [-1, 1]) {
        ellipse(ctx, s * 38, 6, 9, 15, s * -0.4 + (mood === "worried" ? Math.sin(t * 30) * 0.3 : 0));
        fillStroke(ctx, shade(info.body, -10), 3.5);
      }
      return;
  }
}

function drawFace(ctx: Ctx, pose: PetPose): void {
  const lx = pose.look.x * 4;
  const ly = pose.look.y * 3;
  const eyeY = -5;
  const dark = pose.kind === "panda" ? "#fff" : OUTLINE;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (pose.mood === "happy") {
    ctx.strokeStyle = dark;
    ctx.lineWidth = 4;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s * 14, eyeY + 3, 6, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-9, 10);
    ctx.quadraticCurveTo(0, 24, 9, 10);
    ctx.closePath();
    ctx.fillStyle = "#c8475a";
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3;
    ctx.stroke();
    return;
  }
  if (pose.mood === "dead") {
    ctx.strokeStyle = dark;
    ctx.lineWidth = 3.5;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 14 - 5, eyeY - 5);
      ctx.lineTo(s * 14 + 5, eyeY + 5);
      ctx.moveTo(s * 14 + 5, eyeY - 5);
      ctx.lineTo(s * 14 - 5, eyeY + 5);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-8, 16);
    ctx.quadraticCurveTo(0, 9, 8, 16);
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    return;
  }
  if (pose.mood === "hurt") {
    ctx.strokeStyle = dark;
    ctx.lineWidth = 4;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 14 - 6 * s, eyeY - 5);
      ctx.lineTo(s * 14 + 5 * s, eyeY);
      ctx.lineTo(s * 14 - 6 * s, eyeY + 5);
      ctx.stroke();
    }
    ellipse(ctx, 0, 15, 7, 8);
    ctx.fillStyle = "#c8475a";
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3;
    ctx.stroke();
    // tears
    ctx.fillStyle = "#7cc8ff";
    ellipse(ctx, -24, 4, 3.5, 6);
    ctx.fill();
    ellipse(ctx, 24, 4, 3.5, 6);
    ctx.fill();
    return;
  }
  // idle / worried: round eyes with highlights
  const worried = pose.mood === "worried";
  for (const s of [-1, 1]) {
    if (pose.blink && !worried) {
      ctx.strokeStyle = dark;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(s * 14 - 5, eyeY);
      ctx.lineTo(s * 14 + 5, eyeY);
      ctx.stroke();
      continue;
    }
    const r = worried ? 7.5 : 6.5;
    if (worried) {
      circle(ctx, s * 14, eyeY, r + 2.5);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    circle(ctx, s * 14 + lx, eyeY + ly, worried ? 4.5 : r);
    ctx.fillStyle = pose.kind === "panda" ? "#1b1724" : OUTLINE;
    ctx.fill();
    circle(ctx, s * 14 + lx - 1.8, eyeY + ly - 2, worried ? 1.6 : 2.3);
    ctx.fillStyle = "#fff";
    ctx.fill();
  }
  if (worried) {
    // brows
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 8, eyeY - 14);
      ctx.lineTo(s * 20, eyeY - 10);
      ctx.stroke();
    }
    // wobbly mouth
    ctx.beginPath();
    ctx.moveTo(-8, 15);
    ctx.quadraticCurveTo(-4, 11, 0, 15);
    ctx.quadraticCurveTo(4, 19, 8, 15);
    ctx.stroke();
    // sweat drop
    ctx.fillStyle = "#8fd3ff";
    ctx.beginPath();
    ctx.moveTo(31, -26);
    ctx.quadraticCurveTo(24, -14, 31, -12);
    ctx.quadraticCurveTo(38, -14, 31, -26);
    ctx.fill();
  } else if (pose.kind !== "chick" && pose.kind !== "piglet") {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-6, 11);
    ctx.quadraticCurveTo(-3, 15, 0, 11);
    ctx.quadraticCurveTo(3, 15, 6, 11);
    ctx.stroke();
  }
}

function drawFrontFeature(ctx: Ctx, kind: PetKind, info: (typeof PET_INFO)[PetKind], mood: Mood): void {
  if (kind === "chick") {
    ctx.beginPath();
    ctx.moveTo(-8, 6);
    ctx.lineTo(8, 6);
    ctx.lineTo(0, mood === "hurt" || mood === "worried" ? 18 : 15);
    ctx.closePath();
    fillStroke(ctx, info.accent, 3);
  } else if (kind === "piglet") {
    ellipse(ctx, 0, 10, 12, 8.5);
    fillStroke(ctx, info.accent, 3);
    ctx.fillStyle = OUTLINE;
    ellipse(ctx, -4, 10, 2, 3);
    ctx.fill();
    ellipse(ctx, 4, 10, 2, 3);
    ctx.fill();
  } else if (kind === "kitten" || kind === "bunny" || kind === "hamster") {
    ctx.fillStyle = "#ff8fa8";
    ellipse(ctx, 0, 6.5, 3.6, 2.6);
    ctx.fill();
    if (kind === "kitten") {
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 28, 6);
        ctx.lineTo(s * 44, 2);
        ctx.moveTo(s * 28, 11);
        ctx.lineTo(s * 44, 13);
        ctx.stroke();
      }
    }
  }
}

/** Lighten (positive) or darken (negative) a #rrggbb colour. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amount / 100) * (amount > 0 ? 255 - c : c))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// ------------------------------------------------------------------ bees

const beeSprites = new Map<string, HTMLCanvasElement | OffscreenCanvas>();

function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export const BEE_SPRITE_SCALE = 2;

/** Pre-rendered bee frames: kind × wing frame × angry flag. Facing is handled by flipping. */
export function beeSprite(kind: "bee" | "hornet", frame: 0 | 1, mood: "angry" | "dizzy" | "calm"): HTMLCanvasElement | OffscreenCanvas {
  const key = `${kind}${frame}${mood}`;
  const cached = beeSprites.get(key);
  if (cached) return cached;
  const s = BEE_SPRITE_SCALE;
  const size = kind === "hornet" ? 72 : 52;
  const canvas = makeCanvas(size * s, size * s);
  const ctx = canvas.getContext("2d") as Ctx;
  ctx.scale(s, s);
  ctx.translate(size / 2, size / 2);
  const r = kind === "hornet" ? 17 : 11;
  const body = kind === "hornet" ? "#ff7a3d" : "#ffd23f";
  const stripe = kind === "hornet" ? "#5a1f2a" : OUTLINE;

  // wings (behind)
  ctx.save();
  ctx.globalAlpha = 0.85;
  const wy = frame === 0 ? -r * 1.05 : -r * 0.7;
  const wr = frame === 0 ? -0.5 : -0.1;
  ellipse(ctx, -r * 0.25, wy, r * 0.55, r * 0.85, wr - 0.3);
  ctx.fillStyle = "#e9f7ff";
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ellipse(ctx, r * 0.3, wy + 2, r * 0.5, r * 0.75, wr + 0.3);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // stinger (pointing back = left; facing right)
  ctx.beginPath();
  ctx.moveTo(-r * 1.25, 0);
  ctx.lineTo(-r * 1.75, r * 0.2);
  ctx.lineTo(-r * 1.2, r * 0.38);
  ctx.closePath();
  ctx.fillStyle = OUTLINE;
  ctx.fill();

  // body
  ellipse(ctx, 0, 0, r * 1.3, r);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.save();
  ellipse(ctx, 0, 0, r * 1.3, r);
  ctx.clip();
  ctx.fillStyle = stripe;
  for (const sx of [-0.7, -0.15]) ctx.fillRect(r * sx - r * 0.18, -r, r * 0.34, r * 2);
  ellipse(ctx, -r * 0.1, -r * 0.55, r * 0.7, r * 0.25);
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fill();
  ctx.restore();
  ellipse(ctx, 0, 0, r * 1.3, r);
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();

  // eye
  const ex = r * 0.72;
  const ey = -r * 0.15;
  circle(ctx, ex, ey, r * 0.36);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.stroke();
  if (mood === "dizzy") {
    ctx.beginPath();
    ctx.arc(ex, ey, r * 0.2, 0, Math.PI * 1.6);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  } else {
    circle(ctx, ex + r * 0.1, ey + r * 0.05, r * 0.17);
    ctx.fillStyle = OUTLINE;
    ctx.fill();
  }
  if (mood === "angry") {
    ctx.beginPath();
    ctx.moveTo(ex - r * 0.45, ey - r * 0.5);
    ctx.lineTo(ex + r * 0.42, ey - r * 0.25);
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }
  // antenna
  ctx.beginPath();
  ctx.moveTo(r * 0.8, -r * 0.7);
  ctx.quadraticCurveTo(r * 1.0, -r * 1.35, r * 1.35, -r * 1.3);
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  beeSprites.set(key, canvas);
  return canvas;
}
