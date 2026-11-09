import { Rng } from "../core/rng";
import { OUTLINE, circle } from "./art";

type Ctx = CanvasRenderingContext2D;

interface Particle {
  kind: "dot" | "star" | "ring" | "puff" | "spark" | "heart" | "drop";
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  life: number;
  max: number;
  size: number;
  color: string;
  spin: number;
}

interface Floater {
  text: string;
  x: number;
  y: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

/** Particles, floating text and screen shake. Purely cosmetic and not deterministic. */
export class Fx {
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private rng = new Rng(1234);
  shake = 0;
  flash = 0;
  flashColor = "#fff";

  clear(): void {
    this.particles = [];
    this.floaters = [];
    this.shake = 0;
    this.flash = 0;
  }

  burst(x: number, y: number, n: number, opts: Partial<Particle> & { speed?: number; spread?: number; angle?: number } = {}): void {
    const speed = opts.speed ?? 220;
    for (let i = 0; i < n; i++) {
      const a = (opts.angle ?? 0) + (opts.spread !== undefined ? this.rng.range(-opts.spread, opts.spread) : this.rng.range(0, Math.PI * 2));
      const s = speed * this.rng.range(0.35, 1);
      const life = (opts.max ?? 0.7) * this.rng.range(0.6, 1.1);
      this.particles.push({
        kind: opts.kind ?? "dot",
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        g: opts.g ?? 600,
        life,
        max: life,
        size: (opts.size ?? 6) * this.rng.range(0.6, 1.3),
        color: opts.color ?? "#fff",
        spin: this.rng.range(-6, 6),
      });
    }
  }

  text(text: string, x: number, y: number, color = "#fff", size = 34): void {
    this.floaters.push({ text, x, y, life: 0.9, max: 0.9, color, size });
  }

  addShake(amount: number): void {
    this.shake = Math.min(24, this.shake + amount);
  }

  addFlash(amount: number, color = "#fff"): void {
    this.flash = Math.max(this.flash, amount);
    this.flashColor = color;
  }

  update(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      p.vy += p.g * dt;
      p.vx *= p.kind === "puff" ? 0.94 : 0.99;
      p.vy *= p.kind === "puff" ? 0.94 : 1;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floaters) {
      f.life -= dt;
      f.y -= 60 * dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    this.shake = Math.max(0, this.shake - dt * 60);
    this.flash = Math.max(0, this.flash - dt * 3);
  }

  draw(ctx: Ctx): void {
    for (const p of this.particles) {
      const k = p.life / p.max;
      ctx.globalAlpha = Math.min(1, k * 1.6);
      switch (p.kind) {
        case "dot":
        case "drop":
          circle(ctx, p.x, p.y, p.size * (0.4 + 0.6 * k));
          ctx.fillStyle = p.color;
          ctx.fill();
          break;
        case "puff":
          circle(ctx, p.x, p.y, p.size * (1.6 - k * 0.6));
          ctx.fillStyle = p.color;
          ctx.fill();
          break;
        case "ring":
          circle(ctx, p.x, p.y, p.size * (1 + (1 - k) * 4));
          ctx.lineWidth = 5 * k;
          ctx.strokeStyle = p.color;
          ctx.stroke();
          break;
        case "spark":
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 3;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
          ctx.stroke();
          break;
        case "star":
          star(ctx, p.x, p.y, p.size, (1 - k) * p.spin);
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = OUTLINE;
          ctx.stroke();
          break;
        case "heart":
          heartPath(ctx, p.x, p.y, p.size);
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = OUTLINE;
          ctx.stroke();
          break;
      }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const f of this.floaters) {
      const k = f.life / f.max;
      const pop = k > 0.8 ? 1 + (k - 0.8) * 2.5 : 1;
      ctx.globalAlpha = Math.min(1, k * 2.5);
      ctx.font = `900 ${f.size * pop}px "Baloo 2", "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.lineWidth = 7;
      ctx.strokeStyle = OUTLINE;
      ctx.lineJoin = "round";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }
}

export function star(ctx: Ctx, x: number, y: number, r: number, rot = 0): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.48;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

export function heartPath(ctx: Ctx, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x - s * 1.1, y - s * 0.35, x - s * 0.45, y - s * 1.05, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.45, y - s * 1.05, x + s * 1.1, y - s * 0.35, x, y + s * 0.35);
  ctx.closePath();
}
