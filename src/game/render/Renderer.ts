import { TUNING, VIEW_H, VIEW_W } from "../core/config";
import type { Vec } from "../core/math";
import type { LevelDef, WorldTheme } from "../levels/types";
import { CROC_HALF, ICICLE_HALF } from "../sim/enemies";
import { FROG_RADIUS, type Sim } from "../sim/Sim";
import type { Bee, Croc, Frog, Hive, Pet, Prop, SimEvent } from "../sim/types";
import { BEE_SPRITE_SCALE, INK_COLOR, INK_DARK, INK_SHINE, OUTLINE, beeSprite, circle, drawPet, ellipse, shade } from "./art";
import { Fx, star } from "./fx";
import { STYLE, paintBackground, paintSpikes, paintTerrain } from "./scenery";

export interface StrokePreview {
  points: readonly Vec[];
  blocked: boolean;
  cursor: Vec | undefined;
}

export interface ViewState {
  stroke?: StrokePreview | undefined;
  hint?: readonly Vec[][] | undefined;
  ghost?: readonly Vec[][] | undefined;
  /** Plan phase: show where the danger comes from. */
  showThreats: boolean;
}

interface PetAnim {
  squash: number;
  squashV: number;
  lastVy: number;
  blinkT: number;
}

const FONT = `"Baloo 2", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`;

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  readonly fx = new Fx();
  private bg: HTMLCanvasElement | undefined;
  private terrain: HTMLCanvasElement | undefined;
  private scale = 1;
  private t = 0;
  private petAnim = new Map<Pet, PetAnim>();
  private theme: WorldTheme | undefined;
  private level: LevelDef | undefined;
  private clouds: Array<{ x: number; y: number; s: number; v: number }> = [];
  private lastSim: Sim | undefined;

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D is not available");
    this.ctx = ctx;
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    const ratio = Math.min(dpr, 2);
    this.canvas.width = Math.round(cssWidth * ratio);
    this.canvas.height = Math.round(cssHeight * ratio);
    this.scale = this.canvas.width / VIEW_W;
    if (this.level && this.theme) this.buildCaches();
  }

  setLevel(level: LevelDef, theme: WorldTheme): void {
    this.level = level;
    this.theme = theme;
    this.fx.clear();
    this.petAnim.clear();
    this.clouds = [];
    for (let i = 0; i < 4; i++) {
      this.clouds.push({ x: (i * 260 + level.index * 70) % (VIEW_W + 200) - 100, y: 170 + ((i * 137) % 260), s: 0.7 + (i % 3) * 0.25, v: 8 + i * 3 });
    }
    this.buildCaches();
  }

  private buildCaches(): void {
    const level = this.level!;
    const theme = this.theme!;
    const make = () => {
      const c = document.createElement("canvas");
      c.width = this.canvas.width;
      c.height = Math.round(VIEW_H * this.scale);
      const ctx = c.getContext("2d")!;
      ctx.scale(this.scale, this.scale);
      return { c, ctx };
    };
    const bg = make();
    paintBackground(bg.ctx, theme, level.world * 101 + level.index);
    this.bg = bg.c;
    const terrain = make();
    for (const h of level.hazards ?? []) if (h.type === "spikes") paintSpikes(terrain.ctx, h);
    paintTerrain(terrain.ctx, level);
    this.terrain = terrain.c;
  }

  /** Feed simulation events into cosmetic effects. */
  react(events: readonly SimEvent[]): void {
    const fx = this.fx;
    for (const e of events) {
      switch (e.type) {
        case "sting":
          fx.burst(e.x, e.y - 20, 10, { kind: "star", color: "#ffe066", size: 9, speed: 260, g: 500 });
          fx.text("叮!", e.x + 30, e.y - 60, "#ff6b6b", 38);
          fx.burst(e.x, e.y - 40, 1, { kind: "heart", color: "#ff5d73", size: 14, speed: 60, g: -120, max: 0.9 });
          fx.addShake(9);
          fx.addFlash(0.35, "#ff4d4d");
          break;
        case "hurt":
          fx.burst(e.x, e.y - 20, 12, { kind: "star", color: "#ffe066", size: 9, speed: 300 });
          fx.text(e.source === "tongue" ? "啪!" : "哎呀!", e.x, e.y - 64, "#ff6b6b", 36);
          fx.burst(e.x, e.y - 40, 1, { kind: "heart", color: "#ff5d73", size: 14, speed: 60, g: -120, max: 0.9 });
          fx.addShake(12);
          fx.addFlash(0.35, "#ff4d4d");
          break;
        case "shieldPop":
          fx.burst(e.x, e.y, 16, { kind: "drop", color: "#bfe9ff", size: 6, speed: 300, g: 300 });
          fx.text("啵!", e.x, e.y - 64, "#bfe9ff", 32);
          break;
        case "bump":
          fx.burst(e.x, e.y, 3, { kind: "spark", color: "#fff6c2", speed: 200 + e.power * 200, g: 0, max: 0.25 });
          break;
        case "explode":
          fx.burst(e.x, e.y, 26, { kind: "puff", color: "#ffb347", size: 22, speed: 420, g: -60, max: 0.6 });
          fx.burst(e.x, e.y, 18, { kind: "puff", color: "#6d5a6e", size: 18, speed: 260, g: -90, max: 0.9 });
          fx.burst(e.x, e.y, 1, { kind: "ring", color: "#fff1b0", size: 30, speed: 0, g: 0, max: 0.4 });
          fx.text("砰!", e.x, e.y - 30, "#ffd23f", 52);
          fx.addShake(22);
          fx.addFlash(0.6, "#fff4cf");
          break;
        case "beeKilled":
          fx.burst(e.x, e.y, 6, { kind: "puff", color: "#ffffff", size: 8, speed: 120, g: -40, max: 0.5 });
          break;
        case "chomp":
          fx.text("咔嚓!", e.x, e.y - 40, "#ffffff", 40);
          fx.addShake(10);
          break;
        case "splash":
          fx.burst(e.x, e.y, e.big ? 22 : 12, { kind: "drop", color: "#8fd8ff", size: 7, speed: e.big ? 420 : 300, angle: -Math.PI / 2, spread: 1.1, g: 900 });
          break;
        case "sizzle":
          fx.burst(e.x, e.y, 2, { kind: "puff", color: "rgba(80,70,80,0.6)", size: 10, speed: 60, angle: -Math.PI / 2, spread: 0.5, g: -100 });
          break;
        case "tongue":
          if (!e.hit) {
            fx.burst(e.x, e.y, 5, { kind: "star", color: "#ff9ccf", size: 6, speed: 160 });
            fx.text("啵~", e.x, e.y - 24, "#ff9ccf", 28);
          }
          break;
        case "spray":
          fx.burst(e.x, e.y, 30, { kind: "puff", color: "rgba(190,255,220,0.75)", size: 20, speed: 380, g: 0, max: 0.8 });
          fx.burst(e.x, e.y, 1, { kind: "ring", color: "#c8ffe0", size: 34, speed: 0, g: 0, max: 0.45 });
          break;
        case "pin":
          fx.burst(e.x, e.y, 8, { kind: "star", color: "#ff6b6b", size: 7, speed: 150 });
          break;
        case "inkCut":
          fx.burst(e.x, e.y, 9, { kind: "dot", color: INK_COLOR, size: 6, speed: 260, g: 700, max: 0.7 });
          fx.burst(e.x, e.y, 4, { kind: "dot", color: INK_DARK, size: 5, speed: 200, g: 700, max: 0.6 });
          break;
        case "shatter":
          fx.burst(e.x, e.y, 14, { kind: "drop", color: "#d8f3ff", size: 6, speed: 320, angle: -Math.PI / 2, spread: 1.4, g: 1100, max: 0.7 });
          fx.burst(e.x, e.y, 4, { kind: "star", color: "#ffffff", size: 6, speed: 160, max: 0.5 });
          fx.addShake(5);
          break;
        case "crumble":
          for (let i = 0; i < 5; i++) fx.burst(e.x + (i - 2) * (e.w / 5), e.y, 5, { kind: "dot", color: "#8a7a8e", size: 7, speed: 200, g: 900, max: 0.9 });
          fx.burst(e.x, e.y, 10, { kind: "puff", color: "rgba(200,190,200,0.7)", size: 14, speed: 120, g: -40, max: 0.7 });
          fx.text("咔嚓!", e.x, e.y - 40, "#ffffff", 40);
          fx.addShake(10);
          break;
        case "release":
          fx.addShake(3);
          break;
        case "won":
          for (const pet of this.lastSim?.pets ?? []) {
            fx.burst(pet.x, pet.y - 30, 30, { kind: "star", color: "#ffd23f", size: 10, speed: 480, angle: -Math.PI / 2, spread: 1.3, g: 700, max: 1.2 });
            fx.burst(pet.x, pet.y - 30, 6, { kind: "heart", color: "#ff7a9c", size: 12, speed: 160, angle: -Math.PI / 2, spread: 0.8, g: -60, max: 1.3 });
          }
          break;
        case "lost":
          fx.addShake(14);
          break;
        default:
          break;
      }
    }
  }

  draw(sim: Sim, view: ViewState, dt: number): void {
    this.lastSim = sim;
    this.t += dt;
    this.fx.update(dt);
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.bg) ctx.drawImage(this.bg, 0, 0);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    this.drawClouds(dt);

    const shake = this.fx.shake;
    if (shake > 0) ctx.translate(Math.sin(this.t * 91) * shake * 0.5, Math.cos(this.t * 77) * shake * 0.5);

    const level = sim.level;
    this.drawWind(level);
    for (const hive of sim.hives) this.drawHive(hive, view.showThreats);
    for (const frog of sim.frogs) this.drawFrogTelegraph(frog);
    this.drawFluids(level, "back");
    for (const prop of sim.props) this.drawProp(prop);
    if (this.terrain) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (shake > 0) ctx.translate(Math.sin(this.t * 91) * shake * 0.5 * this.scale, Math.cos(this.t * 77) * shake * 0.5 * this.scale);
      ctx.drawImage(this.terrain, 0, 0);
      ctx.restore();
    }
    for (const zone of level.noDraw ?? []) this.drawNoDraw(zone);
    if (view.ghost) for (const g of view.ghost) this.drawDashed(g, "rgba(59,42,64,0.28)", 10, 0);
    if (view.hint) for (const g of view.hint) this.drawDashed(g, "rgba(255,255,255,0.9)", 12, this.t * 40);
    for (const ink of sim.inks) this.drawInk(sim.inkWorldPoints(ink), ink.fixed, 1);
    if (view.stroke && view.stroke.points.length > 0) this.drawStroke(view.stroke, sim.steelInk);
    for (const pin of sim.pins) this.drawPin(pin.x, pin.y, pin.attached);
    for (const frog of sim.frogs) this.drawFrog(frog);
    for (const croc of sim.crocs) this.drawCroc(croc, sim);
    for (const b of sim.boulders) if (b.alive) this.drawBoulder(b.x, b.y, b.r, b.angle);
    for (const bomb of sim.bombs) if (bomb.alive) this.drawBomb(bomb.x, bomb.y, bomb.angle, bomb.fuse);
    for (const ic of sim.hangingIcicles()) {
      // Shiver just before letting go.
      const left = sim.phase === "plan" ? 99 : ic.at - sim.time;
      const shake = left < 0.7 ? Math.sin(this.t * 70) * 3 : 0;
      this.drawIcicle(ic.x + shake, ic.y + ICICLE_HALF.h);
    }
    for (const ic of sim.icicles) if (ic.alive) this.drawIcicle(ic.x, ic.y);
    for (const pet of sim.pets) this.drawPetEntity(pet, sim, dt);
    for (const bee of sim.bees) this.drawBee(bee);
    this.drawFluids(level, "front");
    if (view.showThreats) this.drawThreats(sim);
    this.fx.draw(ctx);

    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    if (this.fx.flash > 0) {
      ctx.globalAlpha = this.fx.flash * 0.35;
      ctx.fillStyle = this.fx.flashColor;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = 1;
    }
    if (sim.phase === "lost" && sim.endT < 1.2) {
      // vignette pulse on failure
      const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 300, VIEW_W / 2, VIEW_H / 2, 800);
      g.addColorStop(0, "rgba(80,0,20,0)");
      g.addColorStop(1, `rgba(80,0,20,${0.4 * Math.min(1, sim.endT * 3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  // ------------------------------------------------------------ pieces

  private drawClouds(dt: number): void {
    const ctx = this.ctx;
    const night = this.theme?.scenery === "night";
    ctx.fillStyle = night ? "rgba(200,200,255,0.12)" : "rgba(255,255,255,0.85)";
    for (const c of this.clouds) {
      c.x += c.v * dt;
      if (c.x > VIEW_W + 140) c.x = -160;
      const s = c.s;
      circle(ctx, c.x, c.y, 34 * s);
      ctx.fill();
      circle(ctx, c.x + 40 * s, c.y - 14 * s, 42 * s);
      ctx.fill();
      circle(ctx, c.x + 84 * s, c.y, 30 * s);
      ctx.fill();
      ctx.fillRect(c.x, c.y, 84 * s, 30 * s);
    }
  }

  private drawWind(level: LevelDef): void {
    const ctx = this.ctx;
    const sim = this.lastSim!;
    for (const h of level.hazards ?? []) {
      if (h.type !== "wind") continue;
      const on = sim.phase !== "survive" || !h.period || ((sim.time + (h.phase ?? 0)) % h.period) / h.period <= (h.duty ?? 0.5);
      const mag = Math.hypot(h.fx, h.fy) || 1;
      const dx = h.fx / mag;
      const dy = h.fy / mag;
      ctx.save();
      ctx.beginPath();
      ctx.rect(h.x, h.y, h.w, h.h);
      ctx.clip();
      ctx.fillStyle = on ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)";
      ctx.fillRect(h.x, h.y, h.w, h.h);
      ctx.strokeStyle = on ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.2)";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      const speed = on ? 420 : 40;
      for (let i = 0; i < 14; i++) {
        const lane = (i * 0.618) % 1;
        const along = ((this.t * speed + i * 157) % (Math.max(h.w, h.h) + 200)) - 100;
        const x = h.x + (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? along : h.w - along) : lane * h.w);
        const y = h.y + (Math.abs(dx) > Math.abs(dy) ? lane * h.h : dy > 0 ? along : h.h - along);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x - dx * 30 + dy * 8, y - dy * 30 + dx * 8, x - dx * 60, y - dy * 60);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawFluids(level: LevelDef, layer: "back" | "front"): void {
    const ctx = this.ctx;
    for (const h of level.hazards ?? []) {
      if (h.type !== "water" && h.type !== "lava") continue;
      const water = h.type === "water";
      const wave = (x: number) => Math.sin(x * 0.03 + this.t * 2.2) * 4 + Math.sin(x * 0.071 - this.t * 1.6) * 2.5;
      if (layer === "back") {
        ctx.fillStyle = water ? "#3f8fd8" : "#c8321f";
        ctx.fillRect(h.x, h.y + 8, h.w, h.h);
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(h.x, h.y + h.h);
      for (let x = h.x; x <= h.x + h.w; x += 10) ctx.lineTo(x, h.y + wave(x));
      ctx.lineTo(h.x + h.w, h.y + h.h);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, h.y, 0, h.y + h.h);
      if (water) {
        g.addColorStop(0, "rgba(110,200,255,0.78)");
        g.addColorStop(1, "rgba(40,110,200,0.92)");
      } else {
        g.addColorStop(0, "rgba(255,170,60,0.95)");
        g.addColorStop(1, "rgba(200,40,30,1)");
      }
      ctx.fillStyle = g;
      ctx.fill();
      ctx.beginPath();
      for (let x = h.x; x <= h.x + h.w; x += 10) {
        if (x === h.x) ctx.moveTo(x, h.y + wave(x));
        else ctx.lineTo(x, h.y + wave(x));
      }
      ctx.lineWidth = 5;
      ctx.strokeStyle = water ? "rgba(235,250,255,0.95)" : "#ffe27a";
      ctx.stroke();
      if (!water) {
        for (let i = 0; i < 6; i++) {
          const bx = h.x + ((i * 97 + this.t * 30) % h.w);
          const phase = (this.t * 0.8 + i * 0.37) % 1;
          circle(ctx, bx, h.y + 30 - phase * 26, 6 * (1 - phase) + 2);
          ctx.fillStyle = "rgba(255,230,120,0.8)";
          ctx.fill();
        }
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        for (let i = 0; i < 4; i++) {
          const sx = h.x + ((i * 173 + this.t * 18) % h.w);
          ctx.fillRect(sx, h.y + 26 + i * 18, 26, 4);
        }
      }
    }
  }

  private drawHive(hive: Hive, threats: boolean): void {
    const ctx = this.ctx;
    const { x, y } = hive;
    if (hive.hang) {
      ctx.strokeStyle = "#7a4b2c";
      ctx.lineCap = "round";
      ctx.lineWidth = 13;
      ctx.beginPath();
      ctx.moveTo(x - 80, y - 52);
      ctx.quadraticCurveTo(x, y - 42, x + 70, y - 60);
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      ctx.fillStyle = "#6cc24a";
      for (const [lx, ly, rot] of [
        [x - 60, y - 64, -0.6],
        [x + 46, y - 74, 0.5],
        [x + 10, y - 58, -0.2],
      ] as const) {
        ellipse(ctx, lx, ly, 16, 8, rot);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.strokeStyle = "#7a4b2c";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x, y - 46);
      ctx.lineTo(x, y - 30);
      ctx.stroke();
    }
    const pulse = 1 + hive.pulse * 0.08 + (threats ? Math.sin(this.t * 4) * 0.02 : 0);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, 1 / pulse);
    const bands = [
      { y: 18, w: 34 },
      { y: 4, w: 37 },
      { y: -10, w: 33 },
      { y: -23, w: 25 },
      { y: -33, w: 14 },
    ];
    for (const b of bands) {
      ellipse(ctx, 0, b.y, b.w, 11);
      ctx.fillStyle = "#f7b538";
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    }
    ellipse(ctx, -10, -14, 8, 5, -0.4);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fill();
    ellipse(ctx, 0, 14, 11, 8);
    ctx.fillStyle = "#4a2a1a";
    ctx.fill();
    ctx.restore();
    // drip
    ctx.fillStyle = "#ffcd4a";
    ellipse(ctx, x + 18, y + 31 + Math.sin(this.t * 2) * 2, 4, 6);
    ctx.fill();
  }

  private drawThreats(sim: Sim): void {
    const ctx = this.ctx;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const hive of sim.hives) {
      const counts = { bee: 0, hornet: 0 };
      for (const q of hive.queue) counts[q.kind] += 1;
      if (counts.bee + counts.hornet === 0) continue;
      const ly = hive.y + (hive.y > 900 ? -78 : 64);
      this.countPill(hive.x, ly, counts.bee, counts.hornet);
    }
    const icicleXs = (sim.level.events ?? [])
      .filter((ev) => ev.type === "icicle")
      .map((ev) => ev.x)
      .sort((a, b) => a - b);
    for (const ev of sim.level.events ?? []) {
      if (ev.type === "bomb") {
        // Drop line: where the bomb will land.
        ctx.save();
        ctx.setLineDash([6, 12]);
        ctx.lineDashOffset = -this.t * 30;
        ctx.strokeStyle = "rgba(214,51,74,0.55)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(ev.x, 330);
        ctx.lineTo(ev.x, 560);
        ctx.stroke();
        ctx.restore();
        const blink = Math.sin(this.t * 8) > 0 ? 1 : 0.65;
        ctx.globalAlpha = blink;
        this.pill(ev.x, 310, `💣 ${ev.at.toFixed(0)}秒`, "#ffe0e0");
        ctx.globalAlpha = 1;
      } else if (ev.type === "icicle") {
        ctx.save();
        ctx.setLineDash([6, 12]);
        ctx.lineDashOffset = -this.t * 30;
        ctx.strokeStyle = "rgba(60,140,200,0.55)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(ev.x, ev.y + ICICLE_HALF.h * 2 + 8);
        ctx.lineTo(ev.x, ev.y + ICICLE_HALF.h * 2 + 150);
        ctx.stroke();
        ctx.restore();
        // Neighbouring icicles get staggered labels so the timings stay readable.
        this.pill(ev.x, ev.y + ICICLE_HALF.h * 2 + 34 + (icicleXs.indexOf(ev.x) % 2) * 46, `${ev.at.toFixed(0)}秒`, "#e2f5ff");
      } else {
        const blink = Math.sin(this.t * 8) > 0 ? 1 : 0.6;
        ctx.globalAlpha = blink;
        const x = Math.min(VIEW_W - 60, Math.max(60, ev.x));
        this.pill(x, Math.max(310, ev.y - 60), `🪨 ${ev.at.toFixed(0)}秒`, "#ffe9d0");
        ctx.globalAlpha = 1;
      }
    }
  }

  /** "bee ×12  hornet ×2" label drawn with the real sprites so players learn what is coming. */
  private countPill(x: number, y: number, bees: number, hornets: number): void {
    const ctx = this.ctx;
    ctx.font = `900 24px ${FONT}`;
    const parts: Array<{ kind: "bee" | "hornet"; n: number }> = [];
    if (bees) parts.push({ kind: "bee", n: bees });
    if (hornets) parts.push({ kind: "hornet", n: hornets });
    const widths = parts.map((pt) => 34 + ctx.measureText(`×${pt.n}`).width);
    const w = widths.reduce((a, b) => a + b, 0) + 18 + (parts.length - 1) * 8;
    x = Math.max(w / 2 + 6, Math.min(VIEW_W - w / 2 - 6, x));
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - 20, w, 40, 20);
    ctx.fillStyle = hornets ? "#ffe6d6" : "#fff8e0";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    let cx = x - w / 2 + 10;
    ctx.textAlign = "left";
    parts.forEach((pt, i) => {
      const sprite = beeSprite(pt.kind, Math.floor(this.t * 8) % 2 === 0 ? 0 : 1, "angry");
      const size = pt.kind === "hornet" ? 36 : 32;
      ctx.drawImage(sprite as CanvasImageSource, cx - 2, y - size / 2, size, size);
      ctx.fillStyle = OUTLINE;
      ctx.fillText(`×${pt.n}`, cx + 30, y + 1);
      cx += widths[i]! + 8;
    });
    ctx.textAlign = "center";
  }

  private pill(x: number, y: number, label: string, fill: string): void {
    const ctx = this.ctx;
    ctx.font = `800 24px ${FONT}`;
    const w = ctx.measureText(label).width + 26;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - 19, w, 38, 19);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.fillStyle = OUTLINE;
    ctx.fillText(label, x, y + 1);
  }

  /** A storm cloud marking where ink cannot be drawn (bodies still pass through). */
  private drawNoDraw(zone: { x: number; y: number; w: number; h: number }): void {
    const ctx = this.ctx;
    const { x, y, w, h } = zone;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 26);
    ctx.fillStyle = "rgba(120,110,150,0.22)";
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = "rgba(90,80,120,0.25)";
    ctx.lineWidth = 6;
    const off = (this.t * 12) % 28;
    for (let k = -h; k < w + h; k += 28) {
      ctx.beginPath();
      ctx.moveTo(x + k + off, y);
      ctx.lineTo(x + k + off - h, y + h);
      ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.setLineDash([12, 10]);
    ctx.lineDashOffset = -this.t * 20;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 26);
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(80,70,110,0.7)";
    ctx.stroke();
    ctx.restore();
    // puffy cloud cap
    ctx.fillStyle = "#8f88aa";
    for (let i = 0; i < Math.max(2, Math.floor(w / 70)); i++) {
      const cx = x + 30 + (i * (w - 60)) / Math.max(1, Math.floor(w / 70) - 1);
      circle(ctx, cx, y + 4, 26 + (i % 2) * 8);
      ctx.fill();
    }
    ctx.font = `900 22px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText("乌云里画不了线", x + w / 2, y + 6);
  }

  private drawPin(x: number, y: number, attached: boolean): void {
    const ctx = this.ctx;
    ellipse(ctx, x + 3, y + 5, 10, 5);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fill();
    if (!attached) {
      circle(ctx, x, y, TUNING.pinRadius + 4 + Math.sin(this.t * 4) * 2);
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "rgba(255,90,90,0.6)";
      ctx.stroke();
      ctx.setLineDash([]);
    }
    circle(ctx, x, y, 10);
    ctx.fillStyle = "#ff5d5d";
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    circle(ctx, x - 3, y - 3, 3);
    ctx.fillStyle = "#ffd0d0";
    ctx.fill();
  }

  private drawInk(points: readonly Vec[], steel: boolean, alpha: number): void {
    if (points.length < 2) {
      if (points.length === 1) {
        circle(this.ctx, points[0]!.x, points[0]!.y, TUNING.inkRadius);
        this.ctx.fillStyle = steel ? "#8a97a8" : INK_COLOR;
        this.ctx.fill();
      }
      return;
    }
    const ctx = this.ctx;
    const r = TUNING.inkRadius;
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(points[0]!.x, points[0]!.y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.x, points[i]!.y);
    };
    path();
    ctx.strokeStyle = steel ? "#2c3440" : INK_DARK;
    ctx.lineWidth = r * 2 + 6;
    ctx.stroke();
    ctx.strokeStyle = steel ? "#8a97a8" : INK_COLOR;
    ctx.lineWidth = r * 2;
    ctx.stroke();
    ctx.save();
    ctx.translate(-1.5, -2.5);
    path();
    ctx.strokeStyle = steel ? "#e6eef8" : INK_SHINE;
    ctx.lineWidth = 3;
    ctx.globalAlpha = alpha * 0.7;
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawStroke(stroke: StrokePreview, steel: boolean): void {
    this.drawInk(stroke.points, steel, 0.92);
    const last = stroke.points[stroke.points.length - 1]!;
    const ctx = this.ctx;
    if (stroke.blocked && stroke.cursor) {
      ctx.setLineDash([8, 8]);
      ctx.strokeStyle = "rgba(255,70,70,0.9)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(stroke.cursor.x, stroke.cursor.y);
      ctx.stroke();
      ctx.setLineDash([]);
      circle(ctx, stroke.cursor.x, stroke.cursor.y, 14);
      ctx.fillStyle = "rgba(255,70,70,0.35)";
      ctx.fill();
    }
    // pen nib glow
    circle(ctx, last.x, last.y, 12 + Math.sin(this.t * 14) * 2);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fill();
  }

  private drawDashed(points: readonly Vec[], color: string, width: number, offset: number): void {
    if (points.length < 2) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.setLineDash([2, width * 1.8]);
    ctx.lineDashOffset = -offset;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(points[0]!.x, points[0]!.y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.x, points[i]!.y);
    ctx.stroke();
    ctx.restore();
  }

  private drawPetEntity(pet: Pet, sim: Sim, dt: number): void {
    const ctx = this.ctx;
    let anim = this.petAnim.get(pet);
    if (!anim) {
      anim = { squash: 1, squashV: 0, lastVy: 0, blinkT: 1 + Math.random() * 2 };
      this.petAnim.set(pet, anim);
    }
    // landing squash spring
    if (anim.lastVy > 220 && pet.vy < 60) anim.squashV -= Math.min(6, anim.lastVy / 120);
    anim.lastVy = pet.vy;
    anim.squashV += (1 - anim.squash) * 180 * dt;
    anim.squashV *= Math.pow(0.0008, dt);
    anim.squash += anim.squashV * dt;
    anim.squash = Math.max(0.7, Math.min(1.25, anim.squash));
    anim.blinkT -= dt;
    if (anim.blinkT < -0.12) anim.blinkT = 2 + Math.random() * 2.5;

    let bob = 0;
    if (pet.mood === "idle") bob = Math.sin(this.t * 2.4) * 0.025;
    if (pet.mood === "happy") bob = Math.abs(Math.sin(this.t * 7)) * 0.12;
    if (pet.mood === "worried") bob = Math.sin(this.t * 22) * 0.02;

    const jump = pet.mood === "happy" ? -Math.abs(Math.sin(this.t * 7)) * 18 : 0;
    const flicker = pet.invuln > 0 && pet.alive && sim.phase === "survive" && Math.floor(this.t * 20) % 2 === 0;

    ellipse(ctx, pet.x, pet.y + TUNING.petRadius + 2, 30, 7);
    ctx.fillStyle = "rgba(40,20,40,0.18)";
    ctx.fill();

    ctx.save();
    ctx.translate(pet.x, pet.y + jump + 2);
    ctx.scale(0.92, 0.92);
    if (flicker) ctx.globalAlpha = 0.55;
    drawPet(ctx, {
      kind: pet.kind,
      mood: pet.mood,
      look: pet.look,
      t: this.t,
      squash: anim.squash + bob,
      blink: anim.blinkT < 0,
      shake: pet.hurtT > 0 ? pet.hurtT * 2 : pet.mood === "worried" ? 0.12 : 0,
    });
    ctx.restore();
    ctx.globalAlpha = 1;

    if (pet.shield > 0) {
      const r = 54 + Math.sin(this.t * 5) * 2;
      circle(ctx, pet.x, pet.y, r);
      ctx.fillStyle = "rgba(170,230,255,0.22)";
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(140,210,255,0.9)";
      ctx.stroke();
      ellipse(ctx, pet.x - 20, pet.y - 28, 12, 6, -0.6);
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fill();
      ctx.font = `900 20px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillStyle = "#2f7fbf";
      ctx.fillText(`×${pet.shield}`, pet.x + 40, pet.y - 44);
    }
  }

  private drawBee(bee: Bee): void {
    if (bee.state === "dead") return;
    const ctx = this.ctx;
    const frame = Math.floor(this.t * 30 + bee.phase * 3) % 2 === 0 ? 0 : 1;
    const mood = bee.state === "stun" ? "dizzy" : bee.state === "leave" ? "calm" : "angry";
    const sprite = beeSprite(bee.kind, frame as 0 | 1, mood);
    const w = sprite.width / BEE_SPRITE_SCALE;
    const h = sprite.height / BEE_SPRITE_SCALE;
    if (bee.kind === "hornet" && bee.mode === "aim" && bee.state === "fly") {
      const blink = Math.floor(this.t * 12) % 2 === 0;
      ctx.save();
      ctx.setLineDash([12, 10]);
      ctx.strokeStyle = blink ? "rgba(255,60,60,0.95)" : "rgba(255,160,60,0.6)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(bee.x, bee.y);
      ctx.lineTo(bee.x + bee.dash.x * 280, bee.y + bee.dash.y * 280);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(bee.x, bee.y + Math.sin(this.t * 9 + bee.phase) * 2);
    if (bee.facing < 0) ctx.scale(-1, 1);
    if (bee.state === "stun") ctx.rotate(Math.sin(this.t * 10 + bee.phase) * 0.5);
    if (bee.kind === "hornet" && bee.mode === "dash") ctx.rotate(Math.atan2(bee.dash.y, Math.abs(bee.dash.x)) * 0.6);
    ctx.drawImage(sprite as CanvasImageSource, -w / 2, -h / 2, w, h);
    ctx.restore();
    if (bee.state === "stun") {
      for (let i = 0; i < 3; i++) {
        const a = this.t * 5 + (i * Math.PI * 2) / 3;
        star(ctx, bee.x + Math.cos(a) * 16, bee.y - 18 + Math.sin(a) * 5, 5, a);
        ctx.fillStyle = "#ffe066";
        ctx.fill();
      }
    }
  }

  private drawProp(prop: Prop): void {
    if (prop.broken) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(prop.x, prop.y);
    ctx.rotate(prop.angle);
    if (prop.shape.kind === "ball") {
      this.rockBall(prop.shape.r);
      ctx.restore();
      return;
    }
    const { w, h } = prop.shape;
    if (prop.role === "raft") {
      const logs = Math.max(2, Math.round(h / 16));
      for (let i = 0; i < logs; i++) {
        const ly = -h / 2 + (h / logs) * (i + 0.5);
        ctx.beginPath();
        ctx.roundRect(-w / 2, ly - h / logs / 2, w, h / logs, h / logs / 2);
        ctx.fillStyle = i % 2 ? "#b77a45" : "#c98b52";
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = OUTLINE;
        ctx.stroke();
      }
    } else {
      const st = STYLE[(prop.style as keyof typeof STYLE) ?? "wood"] ?? STYLE.wood;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, 6);
      ctx.fillStyle = prop.role === "mover" ? "#f0c060" : st.body;
      ctx.fill();
      ctx.save();
      ctx.clip();
      if (prop.role === "mover") {
        ctx.fillStyle = "#3b2a40";
        for (let x = -w / 2 - h; x < w / 2; x += 28) {
          ctx.beginPath();
          ctx.moveTo(x, h / 2);
          ctx.lineTo(x + 14, h / 2);
          ctx.lineTo(x + 14 + h, -h / 2);
          ctx.lineTo(x + h, -h / 2);
          ctx.closePath();
          ctx.globalAlpha = 0.25;
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else if (prop.role === "box" && w < 160 && h > 30) {
        ctx.strokeStyle = st.dots;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(-w / 2, -h / 2);
        ctx.lineTo(w / 2, h / 2);
        ctx.moveTo(w / 2, -h / 2);
        ctx.lineTo(-w / 2, h / 2);
        ctx.stroke();
      } else {
        ctx.strokeStyle = st.dots;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-w / 2, 0);
        ctx.lineTo(w / 2, 0);
        ctx.stroke();
      }
      ctx.restore();
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, 6);
      ctx.lineWidth = 4;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    }
    if (prop.breakAt !== undefined) this.drawCracks(prop, w, h);
    ctx.restore();
    if (prop.role === "seesaw" && prop.pivot) {
      const { x, y } = prop.pivot;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 26, y + 60);
      ctx.lineTo(x + 26, y + 60);
      ctx.closePath();
      ctx.fillStyle = "#a9a7bd";
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      circle(ctx, x, y, 7);
      ctx.fillStyle = "#ffd23f";
      ctx.fill();
      ctx.stroke();
    }
    if (prop.mover) {
      const m = prop.mover;
      ctx.save();
      ctx.setLineDash([4, 10]);
      ctx.strokeStyle = "rgba(59,42,64,0.3)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(m.from.x, m.from.y);
      ctx.lineTo(m.to.x, m.to.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Cracks on a crumbling prop; they widen and shake as the moment approaches. */
  private drawCracks(prop: Prop, w: number, h: number): void {
    const ctx = this.ctx;
    const sim = this.lastSim!;
    const left = sim.phase === "plan" ? 99 : prop.breakAt! - sim.time;
    if (left < 0.6) ctx.translate(Math.sin(this.t * 60) * 2, 0);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = left < 0.6 ? 4 : 2.5;
    ctx.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      const x = -w / 2 + (w * (i + 0.7)) / 3.4;
      ctx.beginPath();
      ctx.moveTo(x, -h / 2);
      ctx.lineTo(x + 6, -h / 6);
      ctx.lineTo(x - 4, h / 6);
      ctx.lineTo(x + 3, h / 2);
      ctx.stroke();
    }
  }

  private rockBall(r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const rr = r * (0.92 + ((i * 37) % 10) / 100);
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = "#9c98b3";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.strokeStyle = "#7b7792";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-r * 0.4, -r * 0.2);
    ctx.lineTo(0, r * 0.1);
    ctx.lineTo(r * 0.3, -r * 0.3);
    ctx.stroke();
    ellipse(ctx, -r * 0.35, -r * 0.45, r * 0.25, r * 0.12, -0.5);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fill();
  }

  private drawBoulder(x: number, y: number, r: number, angle: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    this.rockBall(r);
    ctx.restore();
  }

  /** Icicle centred on (x, y), tip pointing down. */
  private drawIcicle(x: number, y: number): void {
    const ctx = this.ctx;
    const { w, h } = ICICLE_HALF;
    ctx.beginPath();
    ctx.moveTo(x - w, y - h);
    ctx.lineTo(x + w, y - h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
    g.addColorStop(0, "#f4fcff");
    g.addColorStop(1, "#9fd8f2");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - w * 0.4, y - h + 6);
    ctx.lineTo(x - 2, y + h * 0.5);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  private drawBomb(x: number, y: number, angle: number, fuse: number): void {
    const ctx = this.ctx;
    const r = TUNING.bombRadius;
    const urgent = fuse < 0.7;
    const swell = urgent ? 1 + Math.sin(this.t * 40) * 0.06 : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(swell, swell);
    ctx.strokeStyle = "#8a6a4a";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.quadraticCurveTo(8, -r - 14, 16, -r - 10);
    ctx.stroke();
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(-7, -r - 6, 14, 9);
    circle(ctx, 0, 0, r);
    ctx.fillStyle = urgent && Math.floor(this.t * 16) % 2 === 0 ? "#d6334a" : "#2c2436";
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ellipse(ctx, -7, -8, 6, 4, -0.6);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fill();
    star(ctx, 17, -r - 11, 6 + Math.sin(this.t * 30) * 2, this.t * 8);
    ctx.fillStyle = "#ffd23f";
    ctx.fill();
    ctx.restore();
  }

  private drawFrogTelegraph(frog: Frog): void {
    if (frog.state !== "aim") return;
    const ctx = this.ctx;
    const blink = Math.floor(this.t * 12) % 2 === 0;
    ctx.save();
    ctx.setLineDash([10, 10]);
    ctx.strokeStyle = blink ? "rgba(255,80,150,0.9)" : "rgba(255,150,200,0.5)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(frog.x, frog.y - 8);
    ctx.lineTo(frog.x + frog.aim.x * 300, frog.y - 8 + frog.aim.y * 300);
    ctx.stroke();
    ctx.restore();
  }

  private drawFrog(frog: Frog): void {
    const ctx = this.ctx;
    const { x, y } = frog;
    const R = FROG_RADIUS;
    if (frog.state === "shoot" || frog.state === "retract") {
      const mx = x + frog.facing * 14;
      const my = y - 8;
      ctx.strokeStyle = OUTLINE;
      ctx.lineCap = "round";
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(frog.tip.x, frog.tip.y);
      ctx.stroke();
      ctx.strokeStyle = "#ff7fb0";
      ctx.lineWidth = 7;
      ctx.stroke();
      circle(ctx, frog.tip.x, frog.tip.y, 9);
      ctx.fillStyle = "#ff7fb0";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    }
    const puff = frog.state === "aim" ? 1 + Math.sin(this.t * 30) * 0.05 : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(frog.facing * puff, puff);
    ellipse(ctx, 0, 6, R + 6, R - 4);
    ctx.fillStyle = "#6fcf4f";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ellipse(ctx, 4, 14, R - 6, R - 14);
    ctx.fillStyle = "#d8f5a8";
    ctx.fill();
    for (const ex of [-10, 14]) {
      circle(ctx, ex, -R + 6, 11);
      ctx.fillStyle = "#6fcf4f";
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.stroke();
      circle(ctx, ex + 2, -R + 6, 6);
      ctx.fillStyle = "#fff";
      ctx.fill();
      circle(ctx, ex + 3, -R + 6, 3.2);
      ctx.fillStyle = OUTLINE;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(4, 2);
    ctx.quadraticCurveTo(14, 10, 26, 0);
    ctx.lineWidth = 3;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.restore();
  }

  private drawCroc(croc: Croc, sim: Sim): void {
    const ctx = this.ctx;
    const hx = CROC_HALF.x;
    const hy = CROC_HALF.y;
    const pet = sim.nearestPet(croc);
    ctx.save();
    ctx.translate(croc.x, croc.y);
    ctx.scale(croc.facing, 1);
    if (croc.state === "leap") ctx.rotate(Math.max(-0.5, Math.min(0.5, (croc.vy / 900) * croc.facing * -1)) * croc.facing);
    const green = "#5cae4a";
    const dark = shade(green, -25);
    // tail
    ctx.beginPath();
    ctx.moveTo(-hx + 10, -hy + 6);
    ctx.quadraticCurveTo(-hx - 40, -4 + Math.sin(this.t * 6) * 4, -hx - 58, 6 + Math.sin(this.t * 6) * 6);
    ctx.quadraticCurveTo(-hx - 30, hy, -hx + 10, hy - 2);
    ctx.closePath();
    ctx.fillStyle = green;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    // legs
    for (const lx of [-hx + 22, hx - 40]) {
      const step = croc.state === "walk" ? Math.sin(this.t * 10 + lx) * 5 : 0;
      ctx.beginPath();
      ctx.roundRect(lx - 9 + step, hy - 8, 18, 18, 6);
      ctx.fillStyle = dark;
      ctx.fill();
      ctx.stroke();
    }
    // body
    ctx.beginPath();
    ctx.roundRect(-hx + 4, -hy, hx * 2 - 40, hy * 2, hy);
    ctx.fillStyle = green;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(-hx + 14, 2, hx * 2 - 62, hy - 6, 8);
    ctx.fillStyle = "#d9e8a0";
    ctx.fill();
    // back bumps
    ctx.fillStyle = dark;
    for (let i = 0; i < 5; i++) {
      ellipse(ctx, -hx + 22 + i * 16, -hy + 1, 6, 4);
      ctx.fill();
    }
    // head with hinged jaw
    const hingeX = hx - 44;
    const open = croc.jaw * 0.75;
    // lower jaw
    ctx.save();
    ctx.translate(hingeX, 4);
    ctx.rotate(open * 0.35);
    ctx.beginPath();
    ctx.roundRect(0, -2, 52, 16, 7);
    ctx.fillStyle = green;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fff";
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(10 + i * 11, -2);
      ctx.lineTo(15 + i * 11, -9);
      ctx.lineTo(20 + i * 11, -2);
      ctx.fill();
    }
    ctx.restore();
    // upper jaw
    ctx.save();
    ctx.translate(hingeX, 2);
    ctx.rotate(-open);
    if (open > 0.05) {
      ctx.beginPath();
      ctx.roundRect(0, -4, 50, 10, 5);
      ctx.fillStyle = "#d6334a";
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(-6, -20);
    ctx.quadraticCurveTo(40, -24, 60, -8);
    ctx.quadraticCurveTo(62, 2, 54, 4);
    ctx.lineTo(-6, 4);
    ctx.closePath();
    ctx.fillStyle = green;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(12 + i * 11, 4);
      ctx.lineTo(17 + i * 11, 11);
      ctx.lineTo(22 + i * 11, 4);
      ctx.fill();
    }
    circle(ctx, 52, -10, 2.5);
    ctx.fillStyle = OUTLINE;
    ctx.fill();
    ctx.restore();
    // eye
    const ex = hingeX + 4;
    const ey = -hy - 4;
    circle(ctx, ex, ey, 11);
    ctx.fillStyle = green;
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    circle(ctx, ex + 1, ey - 1, 7);
    ctx.fillStyle = "#fff6a8";
    ctx.fill();
    let lx = 2;
    let ly = 0;
    if (pet) {
      const d = Math.hypot(pet.x - croc.x, pet.y - croc.y) || 1;
      lx = ((pet.x - croc.x) / d) * 2.5 * croc.facing;
      ly = ((pet.y - croc.y) / d) * 2.5;
    }
    ellipse(ctx, ex + 1 + lx, ey - 1 + ly, 2.2, 5);
    ctx.fillStyle = OUTLINE;
    ctx.fill();
    if (croc.state === "lurk") {
      ctx.beginPath();
      ctx.moveTo(ex - 10, ey - 12);
      ctx.lineTo(ex + 10, ey - 6);
      ctx.lineWidth = 3.5;
      ctx.stroke();
    }
    ctx.restore();
    if (croc.state === "lurk") {
      ctx.font = `900 34px ${FONT}`;
      ctx.textAlign = "center";
      ctx.lineWidth = 6;
      ctx.strokeStyle = OUTLINE;
      ctx.strokeText("!", croc.x, croc.y - 58);
      ctx.fillStyle = "#ff5d5d";
      ctx.fillText("!", croc.x, croc.y - 58);
    }
  }

  /** Background-only draw for menus (title screen attract mode). */
  drawBackdrop(): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.bg) ctx.drawImage(this.bg, 0, 0);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    this.drawClouds(1 / 60);
  }
}
