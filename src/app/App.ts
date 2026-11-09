import { DT, VIEW_H, VIEW_W } from "../game/core/config";
import { polylineLength, type Vec } from "../game/core/math";
import { LEVELS, levelsOfWorld } from "../game/levels";
import type { LevelDef } from "../game/levels/types";
import { WORLDS, worldOf } from "../game/levels/worlds";
import { PET_INFO } from "../game/render/art";
import { Renderer } from "../game/render/Renderer";
import { endlessLevel } from "../game/sim/endless";
import { Sim } from "../game/sim/Sim";
import { replayStroke } from "../game/sim/stroke";
import { Audio } from "./audio";
import { GameScreen } from "./GameScreen";
import { loadSave, totalStars, writeSave, type SaveData } from "./save";
import { BOOSTERS, BOOSTER_ORDER, PET_ORDER, PET_PRICES, el, escapeHtml, petPortrait, starsHtml } from "./ui";

export interface Screen {
  enter(): void;
  leave(): void;
  frame(dt: number): void;
  key?(e: KeyboardEvent): void;
}

export class App {
  readonly save: SaveData;
  readonly audio = new Audio();
  readonly renderer: Renderer;
  readonly canvas: HTMLCanvasElement;
  readonly ui: HTMLElement;
  private readonly frameEl: HTMLElement;
  private screen: Screen | undefined;
  private last = 0;

  constructor(root: HTMLElement) {
    this.save = loadSave();
    this.audio.soundOn = this.save.sound;
    this.audio.musicOn = this.save.music;
    this.frameEl = root.querySelector<HTMLElement>("#frame")!;
    this.canvas = root.querySelector<HTMLCanvasElement>("#game")!;
    this.ui = root.querySelector<HTMLElement>("#ui")!;
    this.renderer = new Renderer(this.canvas);
    this.layout();
    globalThis.addEventListener("resize", () => this.layout());
    globalThis.addEventListener("keydown", (e) => this.screen?.key?.(e));
    document.addEventListener("pointerdown", () => this.audio.unlock(), { capture: true });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.audio.setBuzz(0);
    });
    this.ui.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("button")) this.audio.unlock();
    });
  }

  start(): void {
    const params = new URLSearchParams(location.search);
    const direct = params.get("level");
    const level = direct ? LEVELS.find((l) => l.id === direct) : undefined;
    if (level) this.playLevel(level);
    else if (params.get("endless") !== null) this.playEndless();
    else this.showTitle();
    const loop = (now: number) => {
      const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 1 / 60;
      this.last = now;
      this.screen?.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private layout(): void {
    const vw = globalThis.innerWidth;
    const vh = globalThis.innerHeight;
    const ratio = VIEW_W / VIEW_H;
    let w = vw;
    let h = vw / ratio;
    if (h > vh) {
      h = vh;
      w = vh * ratio;
    }
    this.frameEl.style.width = `${Math.floor(w)}px`;
    this.frameEl.style.height = `${Math.floor(h)}px`;
    this.renderer.resize(Math.floor(w), Math.floor(h), globalThis.devicePixelRatio || 1);
  }

  go(screen: Screen): void {
    this.screen?.leave();
    this.ui.innerHTML = "";
    this.ui.onclick = null;
    this.screen = screen;
    screen.enter();
  }

  persist(): void {
    writeSave(this.save);
  }

  setSound(on: boolean): void {
    this.save.sound = on;
    this.audio.setSound(on);
    this.persist();
  }

  setMusic(on: boolean): void {
    this.save.music = on;
    this.audio.setMusic(on);
    this.persist();
  }

  showTitle(): void {
    this.go(new TitleScreen(this));
  }

  showMap(world?: number): void {
    this.go(new MapScreen(this, world ?? this.currentWorld()));
  }

  showShop(tab: "boosters" | "pets" = "pets"): void {
    this.go(new ShopScreen(this, tab));
  }

  playLevel(level: LevelDef): void {
    this.go(new GameScreen(this, level, "campaign"));
  }

  playEndless(): void {
    this.go(new GameScreen(this, endlessLevel(), "endless"));
  }

  isUnlocked(level: LevelDef): boolean {
    const i = LEVELS.indexOf(level);
    if (i <= 0) return true;
    return (this.save.stars[LEVELS[i - 1]!.id] ?? 0) > 0 || (this.save.stars[level.id] ?? 0) > 0;
  }

  currentWorld(): number {
    const firstOpen = LEVELS.find((l) => this.isUnlocked(l) && !(this.save.stars[l.id] ?? 0));
    return firstOpen?.world ?? LEVELS[LEVELS.length - 1]!.world;
  }

  honeyBadge(): string {
    return `<div class="honey" title="蜂蜜">🍯 <b>${this.save.honey}</b></div>`;
  }
}

/** Plays reference solutions behind the title, drawing them stroke by stroke like a ghost player. */
class Attract {
  private sim: Sim | undefined;
  private level: LevelDef | undefined;
  private t = 0;
  private drawn: Vec[] = [];
  private pending: Vec[][] = [];
  private cursor = 0;
  private idx = 0;
  private acc = 0;

  constructor(
    private readonly app: App,
    private readonly pool: LevelDef[],
  ) {
    this.next();
  }

  private next(): void {
    this.sim?.dispose();
    this.level = this.pool[this.idx++ % this.pool.length]!;
    this.sim = new Sim(this.level, { petKinds: [this.app.save.pet, "chick"] });
    this.app.renderer.setLevel(this.level, worldOf(this.level.world).theme);
    this.pending = this.level.solution.map((s) => s.slice());
    this.drawn = [];
    this.cursor = 0;
    this.t = 0;
  }

  frame(dt: number): void {
    const sim = this.sim!;
    this.t += dt;
    if (sim.phase === "plan" && this.t > 0.8) {
      const stroke = this.pending[0];
      if (stroke) {
        // Reveal the stroke at ~900 px/s.
        const target = (this.t - 0.8) * 900;
        while (this.cursor < stroke.length && polylineLength(stroke.slice(0, this.cursor + 1)) < target) this.cursor++;
        this.drawn = stroke.slice(0, this.cursor);
        if (this.cursor >= stroke.length) {
          const result = replayStroke(stroke, sim.obstacles(), sim.inkLeft);
          if (result.points) sim.commitStroke(result.points);
          this.pending.shift();
          this.drawn = [];
          this.cursor = 0;
          this.t = 0.8;
          if (this.pending.length === 0) sim.release();
        }
      }
    }
    this.acc += dt;
    while (this.acc >= DT) {
      sim.step();
      this.acc -= DT;
    }
    if (sim.phase === "plan") this.acc = 0;
    this.app.renderer.react(sim.drainEvents());
    this.app.renderer.draw(sim, { stroke: this.drawn.length > 1 ? { points: this.drawn, blocked: false, cursor: undefined } : undefined, showThreats: false }, dt);
    if ((sim.phase === "won" || sim.phase === "lost") && sim.endT > 2.2) this.next();
  }

  dispose(): void {
    this.sim?.dispose();
  }
}

class TitleScreen implements Screen {
  private attract: Attract | undefined;

  constructor(private readonly app: App) {}

  enter(): void {
    const app = this.app;
    const pool = LEVELS.filter((l) => ["1-2", "2-3", "3-2", "1-5", "4-2"].includes(l.id));
    this.attract = new Attract(app, pool.length > 0 ? pool : LEVELS.slice(0, 1));
    const stars = totalStars(app.save);
    const max = LEVELS.length * 3;
    app.ui.innerHTML = `<div class="title-screen">
      <div class="title-top">${app.honeyBadge()}<div class="star-badge">★ <b>${stars}</b>/${max}</div></div>
      <div class="logo"><h1><span>一笔</span><span>护崽</span></h1><p>画一条线，挡住蜂群！</p></div>
      <div class="menu">
        <button class="btn primary big" data-act="play">${stars > 0 ? "继续冒险" : "开始游戏"}</button>
        <button class="btn" data-act="endless">🐝 无尽蜂潮 <small>最高 ${app.save.endlessBest} 波</small></button>
        <button class="btn" data-act="shop">🏠 萌宠小屋</button>
        <div class="toggles">
          <button class="toggle ${app.save.sound ? "on" : ""}" data-act="sound">🔊 音效</button>
          <button class="toggle ${app.save.music ? "on" : ""}" data-act="music">🎵 音乐</button>
        </div>
      </div></div>`;
    app.ui.onclick = (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
      const act = btn?.dataset.act;
      if (!act) return;
      app.audio.unlock();
      app.audio.click();
      if (act === "play") app.showMap();
      else if (act === "endless") app.playEndless();
      else if (act === "shop") app.showShop();
      else if (act === "sound") {
        app.setSound(!app.save.sound);
        btn.classList.toggle("on", app.save.sound);
      } else if (act === "music") {
        app.setMusic(!app.save.music);
        btn.classList.toggle("on", app.save.music);
      }
    };
  }

  leave(): void {
    this.attract?.dispose();
  }

  frame(dt: number): void {
    this.attract?.frame(dt);
  }
}

class MapScreen implements Screen {
  constructor(
    private readonly app: App,
    private world: number,
  ) {}

  enter(): void {
    this.render();
  }

  private render(): void {
    const app = this.app;
    const world = worldOf(this.world);
    const levels = levelsOfWorld(this.world);
    const first = levels[0];
    if (first) app.renderer.setLevel(first, world.theme);
    const worldStars = levels.reduce((a, l) => a + (app.save.stars[l.id] ?? 0), 0);
    const worldOpen = first ? app.isUnlocked(first) : false;
    const tabs = WORLDS.filter((w) => levelsOfWorld(w.id).length > 0)
      .map((w) => {
        const lv = levelsOfWorld(w.id);
        const open = lv[0] ? app.isUnlocked(lv[0]) : false;
        return `<button class="world-tab ${w.id === this.world ? "on" : ""} ${open ? "" : "locked"}" data-world="${w.id}" style="--accent:${w.theme.accent}">${open ? w.id : "🔒"}</button>`;
      })
      .join("");
    const tiles = levels
      .map((l) => {
        const open = app.isUnlocked(l);
        const stars = app.save.stars[l.id] ?? 0;
        return `<button class="level-tile ${open ? "" : "locked"} ${open && stars === 0 ? "fresh" : ""}" data-level="${l.id}" ${open ? "" : "disabled"}>
          <b>${open ? l.index : "🔒"}</b><span class="name">${open ? escapeHtml(l.name) : "未解锁"}</span>
          <span class="stars">${starsHtml(stars)}</span></button>`;
      })
      .join("");
    app.ui.innerHTML = `<div class="map-screen">
      <div class="bar"><button class="icon-btn" data-act="back" aria-label="返回">‹</button><h2>选择关卡</h2>${app.honeyBadge()}</div>
      <div class="world-tabs">${tabs}</div>
      <div class="world-card" style="--accent:${world.theme.accent}">
        <div class="world-pet"></div>
        <div><h3>第${world.id}章 · ${world.name}</h3><p>${world.subtitle}</p>
        <p class="world-progress">★ ${worldStars}/${levels.length * 3} · 通关解锁 <b>${PET_INFO[world.unlockPet].name}</b></p></div>
      </div>
      ${worldOpen ? "" : `<p class="locked-note">先通关上一章，才能来到这里哦</p>`}
      <div class="level-grid">${tiles}</div>
    </div>`;
    app.ui.querySelector(".world-pet")!.append(petPortrait(world.unlockPet, 64, app.save.pets.includes(world.unlockPet) ? "happy" : "idle"));
    app.ui.onclick = (e) => {
      const target = e.target as HTMLElement;
      const act = target.closest<HTMLElement>("[data-act]")?.dataset.act;
      if (act === "back") {
        app.audio.click();
        app.showTitle();
        return;
      }
      const w = target.closest<HTMLElement>("[data-world]")?.dataset.world;
      if (w) {
        app.audio.click();
        this.world = Number(w);
        this.render();
        return;
      }
      const id = target.closest<HTMLElement>("[data-level]")?.dataset.level;
      const level = id ? LEVELS.find((l) => l.id === id) : undefined;
      if (level && app.isUnlocked(level)) {
        app.audio.click();
        app.playLevel(level);
      }
    };
  }

  leave(): void {}

  frame(): void {
    this.app.renderer.drawBackdrop();
  }

  key(e: KeyboardEvent): void {
    if (e.key === "Escape") this.app.showTitle();
  }
}

class ShopScreen implements Screen {
  constructor(
    private readonly app: App,
    private tab: "boosters" | "pets",
  ) {}

  enter(): void {
    const first = LEVELS[0];
    if (first) this.app.renderer.setLevel(first, WORLDS[0]!.theme);
    this.render();
  }

  private render(): void {
    const app = this.app;
    const save = app.save;
    let body: string;
    if (this.tab === "pets") {
      body = PET_ORDER.map((kind) => {
        const owned = save.pets.includes(kind);
        const info = PET_INFO[kind];
        const price = PET_PRICES[kind];
        const action = owned
          ? save.pet === kind
            ? `<button class="btn small" disabled>当前伙伴</button>`
            : `<button class="btn small primary" data-pick="${kind}">选它</button>`
          : `<button class="btn small" data-buy-pet="${kind}" ${save.honey < price.price ? "disabled" : ""}>🍯 ${price.price}</button>`;
        return `<div class="shop-card ${owned ? "" : "locked"}" data-portrait="${kind}"><div class="portrait"></div>
          <div class="info"><h4>${info.name}</h4><p>${info.blurb}</p>${owned ? "" : `<p class="hint">通关第 ${price.world} 章免费获得</p>`}</div>${action}</div>`;
      }).join("");
    } else {
      body = BOOSTER_ORDER.map((id) => {
        const info = BOOSTERS[id];
        return `<div class="shop-card"><div class="portrait icon">${info.icon}</div>
          <div class="info"><h4>${info.name} <small>拥有 ×${save.boosters[id] ?? 0}</small></h4><p>${info.desc}</p></div>
          <button class="btn small" data-buy="${id}" ${save.honey < info.price ? "disabled" : ""}>🍯 ${info.price}</button></div>`;
      }).join("");
    }
    app.ui.innerHTML = `<div class="shop-screen">
      <div class="bar"><button class="icon-btn" data-act="back" aria-label="返回">‹</button><h2>萌宠小屋</h2>${app.honeyBadge()}</div>
      <div class="tabs"><button class="${this.tab === "pets" ? "on" : ""}" data-tab="pets">萌宠</button><button class="${this.tab === "boosters" ? "on" : ""}" data-tab="boosters">道具</button></div>
      <div class="shop-list">${body}</div>
      <p class="shop-foot">过关拿星星就能赚蜂蜜：新星 +10🍯，首通 +5🍯。</p>
    </div>`;
    for (const card of app.ui.querySelectorAll<HTMLElement>("[data-portrait]")) {
      const kind = card.dataset.portrait as (typeof PET_ORDER)[number];
      card.querySelector(".portrait")!.append(petPortrait(kind, 72, save.pet === kind ? "happy" : "idle"));
    }
    app.ui.onclick = (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest<HTMLElement>("button");
      if (!btn || btn.hasAttribute("disabled")) return;
      app.audio.click();
      if (btn.dataset.act === "back") return app.showTitle();
      if (btn.dataset.tab) {
        this.tab = btn.dataset.tab as "pets" | "boosters";
        return this.render();
      }
      if (btn.dataset.pick) {
        save.pet = btn.dataset.pick as typeof save.pet;
        app.persist();
        return this.render();
      }
      if (btn.dataset.buyPet) {
        const kind = btn.dataset.buyPet as typeof save.pet;
        const price = PET_PRICES[kind].price;
        if (save.honey >= price && !save.pets.includes(kind)) {
          save.honey -= price;
          save.pets.push(kind);
          save.pet = kind;
          app.audio.coin();
          app.persist();
        }
        return this.render();
      }
      if (btn.dataset.buy) {
        const id = btn.dataset.buy as keyof typeof BOOSTERS;
        const price = BOOSTERS[id].price;
        if (save.honey >= price) {
          save.honey -= price;
          save.boosters[id] = (save.boosters[id] ?? 0) + 1;
          app.audio.coin();
          app.persist();
        }
        return this.render();
      }
    };
  }

  leave(): void {}

  frame(): void {
    this.app.renderer.drawBackdrop();
  }

  key(e: KeyboardEvent): void {
    if (e.key === "Escape") this.app.showTitle();
  }
}

export function mountError(root: HTMLElement, error: unknown): void {
  const box = el("div", "boot-error", `<h2>加载失败了</h2><p>${escapeHtml(String(error))}</p><button class="btn primary">重新加载</button>`);
  box.querySelector("button")!.addEventListener("click", () => location.reload());
  root.append(box);
}
