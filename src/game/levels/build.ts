import type { Vec } from "../core/math";
import { VIEW_H, VIEW_W } from "../core/config";
import type { TerrainShape, TerrainStyle } from "./types";

/** Helpers that keep level files short and readable. */

export const p = (x: number, y: number): Vec => ({ x, y });

export function rect(x: number, y: number, w: number, h: number, style: TerrainStyle = "grass"): TerrainShape {
  return { style, poly: [p(x, y), p(x + w, y), p(x + w, y + h), p(x, y + h)] };
}

/** Full-width ground whose top surface sits at `y`. */
export function ground(y: number, style: TerrainStyle = "grass", x0 = -40, x1 = VIEW_W + 40): TerrainShape {
  return rect(x0, y, x1 - x0, VIEW_H + 80 - y, style);
}

/** Platform centred on `cx`, top surface at `y`. */
export function ledge(cx: number, y: number, w: number, h = 34, style: TerrainStyle = "grass"): TerrainShape {
  return rect(cx - w / 2, y, w, h, style);
}



export function poly(style: TerrainStyle, ...points: Vec[]): TerrainShape {
  return { style, poly: points };
}

/** Regular-ish polygon rock. */
export function rock(cx: number, cy: number, r: number, sides = 7, style: TerrainStyle = "rock"): TerrainShape {
  const pts: Vec[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
    pts.push(p(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return { style, poly: pts };
}

/** Points on a circular arc, angles in degrees (0 = right, 90 = down). */
export function arc(cx: number, cy: number, r: number, fromDeg: number, toDeg: number, steps = 18): Vec[] {
  const pts: Vec[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((fromDeg + ((toDeg - fromDeg) * i) / steps) * Math.PI) / 180;
    pts.push(p(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return pts;
}

/** Points along a straight polyline through the given corners, resampled every `step` px. */
export function path(step: number, ...corners: Vec[]): Vec[] {
  const pts: Vec[] = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const a = corners[i]!;
    const b = corners[i + 1]!;
    const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 0; k < n; k++) pts.push(p(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n));
  }
  pts.push(corners[corners.length - 1]!);
  return pts;
}

/**
 * A tall, narrow "bell" cover: legs start `half` px either side of `cx` at `base`, flare out a little,
 * and close with a round top. Used where a pet stands on something too narrow for a dome.
 */
export function bell(cx: number, base: number, half: number, height: number): Vec[] {
  const flare = half + 7;
  const top = base - height;
  return [
    p(cx - half, base),
    p(cx - half - 3, base - 25),
    p(cx - flare, base - 55),
    p(cx - flare, top + flare),
    ...arc(cx, top + flare, flare, 180, 360, 12),
    p(cx + flare, base - 55),
    p(cx + half + 3, base - 25),
    p(cx + half, base),
  ];
}
