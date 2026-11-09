import { VIEW_H, VIEW_W } from "../core/config";
import type { Vec } from "../core/math";
import { Rng } from "../core/rng";
import type { Hazard, LevelDef, TerrainStyle, WorldTheme } from "../levels/types";
import { OUTLINE, circle, ellipse, shade } from "./art";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export const STYLE: Record<TerrainStyle, { body: string; dots: string; cap?: string; capDark?: string }> = {
  grass: { body: "#d69c63", dots: "#b9804c", cap: "#86d65c", capDark: "#4e9e3c" },
  rock: { body: "#aeb0c6", dots: "#9193ab" },
  wood: { body: "#dca46a", dots: "#b98148" },
  sand: { body: "#f3d68f", dots: "#dcb867", cap: "#ffe7ad", capDark: "#d8b25e" },
  basalt: { body: "#4c3d55", dots: "#382b40", cap: "#6b5472", capDark: "#2c2032" },
  ice: { body: "#bfe8fb", dots: "#9fd4ee", cap: "#ffffff", capDark: "#8ccbe8" },
  snow: { body: "#e9f2fc", dots: "#d3e2f3", cap: "#ffffff", capDark: "#b7cfea" },
  candy: { body: "#ffa9d2", dots: "#ff86bf", cap: "#fff1f8", capDark: "#ff7ab6" },
  cloud: { body: "#ffffff", dots: "#e8eefc", cap: "#ffffff", capDark: "#cfd9f0" },
  bamboo: { body: "#b9d36a", dots: "#8fae45" },
};

function hill(ctx: Ctx, baseY: number, amp: number, freq: number, phase: number, color: string): void {
  ctx.beginPath();
  ctx.moveTo(0, VIEW_H);
  for (let x = 0; x <= VIEW_W; x += 12) {
    const y = baseY - amp * (0.6 * Math.sin(x * freq + phase) + 0.4 * Math.sin(x * freq * 2.3 + phase * 1.7));
    ctx.lineTo(x, y);
  }
  ctx.lineTo(VIEW_W, VIEW_H);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

export function paintBackground(ctx: Ctx, theme: WorldTheme, seed: number): void {
  const rng = new Rng(seed);
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  sky.addColorStop(0, theme.skyTop);
  sky.addColorStop(1, theme.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  switch (theme.scenery) {
    case "night": {
      for (let i = 0; i < 90; i++) {
        const x = rng.range(0, VIEW_W);
        const y = rng.range(0, VIEW_H * 0.6);
        ctx.fillStyle = `rgba(255,255,230,${rng.range(0.3, 0.9)})`;
        circle(ctx as CanvasRenderingContext2D, x, y, rng.range(0.8, 2.4));
        ctx.fill();
      }
      circle(ctx as CanvasRenderingContext2D, 560, 250, 62);
      ctx.fillStyle = "#fff6cf";
      ctx.fill();
      circle(ctx as CanvasRenderingContext2D, 585, 232, 54);
      ctx.fillStyle = theme.skyTop;
      ctx.fill();
      break;
    }
    case "volcano": {
      ctx.fillStyle = "rgba(255,190,120,0.35)";
      circle(ctx as CanvasRenderingContext2D, 520, 300, 120);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(150, 900);
      ctx.lineTo(330, 470);
      ctx.lineTo(420, 470);
      ctx.lineTo(620, 900);
      ctx.closePath();
      ctx.fillStyle = theme.far;
      ctx.fill();
      ctx.fillStyle = "#ff8a3d";
      ctx.beginPath();
      ctx.moveTo(330, 470);
      ctx.lineTo(420, 470);
      ctx.lineTo(400, 520);
      ctx.lineTo(372, 495);
      ctx.lineTo(345, 525);
      ctx.closePath();
      ctx.fill();
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = `rgba(90,70,90,${0.18 + i * 0.03})`;
        circle(ctx as CanvasRenderingContext2D, 375 + Math.sin(i * 1.7) * 30, 430 - i * 55, 34 + i * 10);
        ctx.fill();
      }
      break;
    }
    default: {
      ctx.fillStyle = theme.scenery === "snow" ? "rgba(255,255,255,0.75)" : "rgba(255,244,190,0.9)";
      circle(ctx as CanvasRenderingContext2D, 580, 230, 58);
      ctx.fill();
      ctx.fillStyle = "rgba(255,244,190,0.25)";
      circle(ctx as CanvasRenderingContext2D, 580, 230, 95);
      ctx.fill();
    }
  }

  if (theme.scenery === "snow") {
    ctx.fillStyle = theme.far;
    ctx.beginPath();
    ctx.moveTo(-20, 860);
    const peaks: Vec[] = [
      { x: 90, y: 520 },
      { x: 200, y: 700 },
      { x: 330, y: 470 },
      { x: 470, y: 690 },
      { x: 600, y: 540 },
      { x: 760, y: 760 },
    ];
    for (const pk of peaks) ctx.lineTo(pk.x, pk.y);
    ctx.lineTo(760, 900);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    for (const pk of [peaks[0]!, peaks[2]!, peaks[4]!]) {
      ctx.beginPath();
      ctx.moveTo(pk.x - 46, pk.y + 80);
      ctx.lineTo(pk.x, pk.y);
      ctx.lineTo(pk.x + 46, pk.y + 80);
      ctx.lineTo(pk.x + 20, pk.y + 66);
      ctx.lineTo(pk.x, pk.y + 86);
      ctx.lineTo(pk.x - 20, pk.y + 66);
      ctx.closePath();
      ctx.fill();
    }
  } else if (theme.scenery !== "volcano") {
    hill(ctx, 760, 70, 0.006, rng.range(0, 6), theme.far);
  }
  hill(ctx, 880, 55, 0.009, rng.range(0, 6), theme.near);

  // Scenery-specific silhouettes on the near hills.
  if (theme.scenery === "meadow" || theme.scenery === "night") {
    for (let i = 0; i < 5; i++) {
      const x = rng.range(30, VIEW_W - 30);
      const y = 860 + rng.range(-20, 30);
      ctx.fillStyle = shade(theme.near, -12);
      ctx.fillRect(x - 4, y - 30, 8, 34);
      circle(ctx as CanvasRenderingContext2D, x, y - 46, rng.range(24, 34));
      ctx.fillStyle = shade(theme.near, theme.scenery === "night" ? -20 : -8);
      ctx.fill();
    }
  } else if (theme.scenery === "pond") {
    for (let i = 0; i < 14; i++) {
      const x = rng.range(0, VIEW_W);
      const h = rng.range(50, 110);
      ctx.strokeStyle = shade(theme.near, -18);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x, 900);
      ctx.quadraticCurveTo(x + 6, 900 - h / 2, x + rng.range(-10, 10), 900 - h);
      ctx.stroke();
      ellipse(ctx as CanvasRenderingContext2D, x + 2, 900 - h, 4, 12);
      ctx.fillStyle = "#8a5a3c";
      ctx.fill();
    }
  } else if (theme.scenery === "snow") {
    for (let i = 0; i < 7; i++) {
      const x = rng.range(20, VIEW_W - 20);
      const y = 880 + rng.range(-20, 20);
      const s = rng.range(0.7, 1.2);
      ctx.fillStyle = shade(theme.near, -25);
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.moveTo(x - 26 * s + k * 5 * s, y - k * 22 * s);
        ctx.lineTo(x, y - (k * 22 + 40) * s);
        ctx.lineTo(x + 26 * s - k * 5 * s, y - k * 22 * s);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
}

export function paintTerrain(ctx: CanvasRenderingContext2D, level: LevelDef): void {
  const rng = new Rng(level.id.length * 977 + level.index * 131);
  // Outline everything first at double width; the fills below then hide seams between touching pieces.
  ctx.lineJoin = "round";
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 8;
  for (const shape of level.terrain) {
    if (shape.porous) continue;
    pathPoly(ctx, shape.poly);
    ctx.stroke();
  }
  for (const shape of level.terrain) {
    if (shape.porous) {
      paintBamboo(ctx, shape.poly);
      continue;
    }
    const st = STYLE[shape.style];
    const poly = shape.poly;
    ctx.save();
    pathPoly(ctx, poly);
    ctx.fillStyle = st.body;
    ctx.fill();
    ctx.clip();
    // speckles
    const minX = Math.min(...poly.map((v) => v.x));
    const maxX = Math.max(...poly.map((v) => v.x));
    const minY = Math.min(...poly.map((v) => v.y));
    const maxY = Math.min(VIEW_H, Math.max(...poly.map((v) => v.y)));
    const area = (maxX - minX) * (maxY - minY);
    ctx.fillStyle = st.dots;
    if (shape.style === "wood") {
      ctx.strokeStyle = st.dots;
      ctx.lineWidth = 3;
      for (let y = minY + 16; y < maxY; y += 18) {
        ctx.beginPath();
        ctx.moveTo(minX, y);
        ctx.lineTo(maxX, y);
        ctx.stroke();
      }
    } else if (shape.style === "candy") {
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 12;
      for (let x = minX - (maxY - minY); x < maxX; x += 36) {
        ctx.beginPath();
        ctx.moveTo(x, maxY);
        ctx.lineTo(x + (maxY - minY), minY);
        ctx.stroke();
      }
    } else {
      for (let i = 0; i < Math.min(160, area / 1800); i++) {
        const x = rng.range(minX, maxX);
        const y = rng.range(minY + 16, maxY);
        ellipse(ctx, x, y, rng.range(3, 7), rng.range(2, 4.5), rng.range(0, 3));
        ctx.fill();
      }
    }
    if (shape.style === "basalt") {
      ctx.strokeStyle = "rgba(255,120,60,0.55)";
      ctx.lineWidth = 2.5;
      for (let i = 0; i < Math.min(10, area / 12000); i++) {
        let x = rng.range(minX, maxX);
        let y = rng.range(minY + 20, maxY);
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let k = 0; k < 3; k++) {
          x += rng.range(-18, 18);
          y += rng.range(6, 20);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    // Caps on upward-facing edges.
    if (st.cap) {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!;
        const b = poly[(i + 1) % poly.length]!;
        const nx = -(b.y - a.y);
        const ny = b.x - a.x;
        const l = Math.hypot(nx, ny) || 1;
        // Normal pointing out of the polygon and up?
        const c = centroid(poly);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const outward = (mid.x - c.x) * nx + (mid.y - c.y) * ny > 0 ? 1 : -1;
        const upness = (-ny / l) * outward;
        if (upness < 0.45) continue;
        ctx.lineCap = "round";
        ctx.strokeStyle = st.capDark!;
        ctx.lineWidth = 34;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.strokeStyle = st.cap;
        ctx.lineWidth = 24;
        ctx.stroke();
        if (shape.style === "grass") {
          // little tufts
          ctx.fillStyle = st.cap;
          const n = Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / 26);
          for (let k = 0; k < n; k++) {
            const t = (k + 0.5) / n;
            const x = a.x + (b.x - a.x) * t;
            const y = a.y + (b.y - a.y) * t + 11;
            ellipse(ctx, x, y, 9, 6);
            ctx.fill();
          }
        }
      }
    }
    ctx.restore();
    // Grass flowers along tops.
    if (shape.style === "grass") {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!;
        const b = poly[(i + 1) % poly.length]!;
        if (Math.abs(b.y - a.y) > Math.abs(b.x - a.x) * 0.6) continue;
        const c = centroid(poly);
        if ((a.y + b.y) / 2 > c.y) continue;
        const n = Math.floor(Math.abs(b.x - a.x) / 120);
        for (let k = 0; k < n; k++) {
          if (rng.next() < 0.45) continue;
          const t = rng.range(0.1, 0.9);
          const x = a.x + (b.x - a.x) * t;
          const y = a.y + (b.y - a.y) * t - 2;
          flower(ctx, x, y, rng.pick(["#ff8fb1", "#fff2a6", "#ffffff", "#c9a7ff"]));
        }
      }
    }
  }
}

/** A see-through bamboo fence: rails plus slats with visible gaps. */
function paintBamboo(ctx: CanvasRenderingContext2D, poly: readonly Vec[]): void {
  const minX = Math.min(...poly.map((v) => v.x));
  const maxX = Math.max(...poly.map((v) => v.x));
  const minY = Math.min(...poly.map((v) => v.y));
  const maxY = Math.max(...poly.map((v) => v.y));
  const w = maxX - minX;
  const h = maxY - minY;
  const vertical = h > w;
  ctx.lineJoin = "round";
  const slat = (x: number, y: number, sw: number, sh: number) => {
    ctx.beginPath();
    ctx.roundRect(x, y, sw, sh, Math.min(sw, sh) / 2);
    ctx.fillStyle = STYLE.bamboo.body;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  };
  if (!vertical) {
    for (let x = minX + 2; x < maxX - 6; x += 18) slat(x, minY, 11, h);
    slat(minX - 4, minY + h * 0.18, w + 8, 7);
    slat(minX - 4, maxY - h * 0.18 - 7, w + 8, 7);
  } else {
    for (let y = minY + 2; y < maxY - 6; y += 18) slat(minX, y, w, 11);
    slat(minX + w * 0.18, minY - 4, 7, h + 8);
    slat(maxX - w * 0.18 - 7, minY - 4, 7, h + 8);
  }
}

function flower(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.strokeStyle = "#4e9e3c";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 14);
  ctx.stroke();
  ctx.fillStyle = color;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    circle(ctx, x + Math.cos(a) * 5, y - 16 + Math.sin(a) * 5, 4);
    ctx.fill();
  }
  circle(ctx, x, y - 16, 3);
  ctx.fillStyle = "#ffcf3f";
  ctx.fill();
}

export function paintSpikes(ctx: CanvasRenderingContext2D, h: Extract<Hazard, { type: "spikes" }>): void {
  const tip = h.dir === "up" ? -26 : 26;
  for (let x = h.x1; x < h.x2 - 4; x += 24) {
    const x2 = Math.min(x + 24, h.x2);
    ctx.beginPath();
    ctx.moveTo(x, h.y);
    ctx.lineTo((x + x2) / 2, h.y + tip);
    ctx.lineTo(x2, h.y);
    ctx.closePath();
    ctx.fillStyle = "#d9dce8";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = OUTLINE;
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo((x + x2) / 2, h.y + tip);
    ctx.lineTo(x2 - 3, h.y);
    ctx.lineTo((x + x2) / 2 + 2, h.y);
    ctx.closePath();
    ctx.fillStyle = "#9da2b8";
    ctx.fill();
  }
}

export function pathPoly(ctx: CanvasRenderingContext2D, poly: readonly Vec[]): void {
  ctx.beginPath();
  ctx.moveTo(poly[0]!.x, poly[0]!.y);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i]!.x, poly[i]!.y);
  ctx.closePath();
}

function centroid(poly: readonly Vec[]): Vec {
  let x = 0;
  let y = 0;
  for (const v of poly) {
    x += v.x;
    y += v.y;
  }
  return { x: x / poly.length, y: y / poly.length };
}
