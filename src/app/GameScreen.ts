import { DT, VIEW_H, VIEW_W } from "../game/core/config";
import type { Vec } from "../game/core/math";
import { levelsOfWorld, nextLevel } from "../game/levels";
import { arc } from "../game/levels/build";
import type { LevelDef, PetKind } from "../game/levels/types";
import { worldOf } from "../game/levels/worlds";
import { PET_INFO } from "../game/render/art";
import { ENDLESS_HONEY_PER_WAVE, EndlessDirector } from "../game/sim/endless";
import { Sim } from "../game/sim/Sim";
import { StrokeBuilder, replayStroke } from "../game/sim/stroke";
import type { BoosterId, SimEvent } from "../game/sim/types";
import type { App, Screen } from "./App";
import { recordWin } from "./save";
import { BOOSTERS, BOOSTER_ORDER, DEATH_TEXT, PET_ORDER, el, escapeHtml, petPortrait, starsHtml } from "./ui";

type Mode = "campaign" | "endless";

const HINT_PRICE = 20;

export class GameScreen implements Screen {
  private sim!: Sim;
  private director: EndlessDirector | undefined;
  private readonly selected = new Set<BoosterId>();
  private stroke: StrokeBuilder | undefined;
  private pointerId: number | undefined;
  private lastMove = { x: 0, y: 0, t: 0 };
  private showHint = false;
  private ghost: Vec[][] | undefined;
  private strokesThisAttempt: Vec[][] = [];
  private acc = 0;
  private resultShown = false;
  private paused = false;
  private boostersConsumed = false;
  private intermissionT = 0;
  private honeyThisRun = 0;
  private readonly root: HTMLElement;
  private hud!: {
    timer: HTMLElement;
    timerRing: SVGCircleElement;
    inkFill: HTMLElement;
    inkPar: HTMLElement;
    inkText: HTMLElement;
    tip: HTMLElement;
    tray: HTMLElement;
    go: HTMLButtonElement;
    sprayInfo: HTMLElement;
    banner: HTMLElement;
    modal: HTMLElement;
    hintBtn: HTMLButtonElement;
    wave: HTMLElement;
    hearts: HTMLElement;
  };
  private lastHud = { timer: "", ink: -1, phase: "", hearts: "" };

  constructor(
    private readonly app: App,
    private level: LevelDef,
    private readonly mode: Mode,
  ) {
    this.root = app.ui;
  }

  // ------------------------------------------------------------ lifecycle

  enter(): void {
    this.buildHud();
    this.newAttempt();
    const canvas = this.app.canvas;
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
  }

  leave(): void {
    const canvas = this.app.canvas;
    canvas.removeEventListener("pointerdown", this.onDown);
    canvas.removeEventListener("pointermove", this.onMove);
    canvas.removeEventListener("pointerup", this.onUp);
    canvas.removeEventListener("pointercancel", this.onUp);
    this.app.audio.setBuzz(0);
    this.app.audio.drawEnd();
    this.sim.dispose();
  }

  private petKinds(): PetKind[] {
    const main = this.app.save.pet;
    const companion = PET_ORDER.find((k) => k !== main && this.app.save.pets.includes(k)) ?? (main === "chick" ? "hamster" : "chick");
    return [main, companion];
  }

  private newAttempt(): void {
    this.sim?.dispose();
    for (const id of [...this.selected]) if ((this.app.save.boosters[id] ?? 0) <= 0) this.selected.delete(id);
    this.sim = new Sim(this.level, { boosters: [...this.selected], petKinds: this.petKinds() });
    this.director = this.mode === "endless" ? new EndlessDirector(this.sim) : undefined;
    this.app.renderer.setLevel(this.level, worldOf(this.level.world).theme);
    this.stroke = undefined;
    this.pointerId = undefined;
    this.resultShown = false;
    this.boostersConsumed = false;
    this.strokesThisAttempt = [];
    this.acc = 0;
    this.honeyThisRun = 0;
    this.intermissionT = 0;
    this.showHint = this.mode === "campaign" && (this.level.id === "1-1" || this.app.save.hinted.includes(this.level.id));
    this.hud.modal.hidden = true;
    this.hud.modal.innerHTML = "";
    this.hud.banner.className = "banner";
    this.lastHud = { timer: "", ink: -1, phase: "", hearts: "" };
    this.renderTray();
    this.updateHud(true);
    if (this.mode === "campaign" && new URLSearchParams(location.search).has("auto")) this.autoplay();
  }

  /** Debug aid (`?auto`): draws the reference solution so a level can be watched end to end. */
  private autoplay(): void {
    const naive = new URLSearchParams(location.search).get("auto") === "naive";
    const strokes = naive ? this.level.pets.map((pet) => arc(pet.x, pet.y + 26, 100, 182, 358, 20)) : this.level.solution;
    for (const stroke of strokes) {
      if (this.sim.phase !== "plan") break;
      const result = replayStroke(stroke, this.sim.obstacles(), this.sim.inkLeft);
      if (result.points) this.sim.commitStroke(result.points);
    }
    this.sim.release();
  }

  retry(): void {
    if (this.strokesThisAttempt.length > 0) this.ghost = this.strokesThisAttempt.map((s) => s.slice());
    this.app.audio.click();
    this.newAttempt();
  }

  // ------------------------------------------------------------ HUD

  private buildHud(): void {
    const level = this.level;
    const isEndless = this.mode === "endless";
    this.root.innerHTML = "";
    const top = el("div", "hud-top");
    top.innerHTML = `
      <button class="icon-btn" data-act="pause" aria-label="暂停">❚❚</button>
      <div class="left-col">
        <div class="level-chip">${isEndless ? "无尽蜂潮" : `${level.world}-${level.index}`}<span>${isEndless ? `最高 ${this.app.save.endlessBest} 波` : escapeHtml(level.name)}</span></div>
        <div class="hearts"></div>
      </div>
      <div class="timer" aria-live="off">
        <svg viewBox="0 0 100 100"><circle class="ring-bg" cx="50" cy="50" r="42"/><circle class="ring" cx="50" cy="50" r="42"/></svg>
        <b>8</b><small>秒</small>
      </div>
      <div class="wave-chip" ${isEndless ? "" : "hidden"}>第 1 波</div>
      <button class="icon-btn" data-act="retry" aria-label="重来">↻</button>`;
    const tip = el("div", "tip");
    const bottom = el("div", "hud-bottom");
    bottom.innerHTML = `
      <div class="spray-info" hidden>💨 点击屏幕喷雾驱蜂 <b></b></div>
      <button class="go-btn" hidden>开始守护！</button>
      <div class="ink-row">
        <div class="ink-bar" title="墨水">
          <div class="ink-fill"></div>
          <div class="ink-par" title="在这条线之前画完可得省墨星"></div>
          <span class="ink-pen">✏️</span>
          <span class="ink-text"></span>
        </div>
        <button class="icon-btn hint-btn" data-act="hint" aria-label="提示" ${isEndless ? "hidden" : ""}>💡</button>
      </div>
      <div class="tray"></div>`;
    const banner = el("div", "banner");
    const modal = el("div", "modal");
    modal.hidden = true;
    this.root.append(top, tip, bottom, banner, modal);
    this.hud = {
      timer: top.querySelector(".timer b")!,
      timerRing: top.querySelector(".ring")!,
      inkFill: bottom.querySelector(".ink-fill")!,
      inkPar: bottom.querySelector(".ink-par")!,
      inkText: bottom.querySelector(".ink-text")!,
      tip,
      tray: bottom.querySelector(".tray")!,
      go: bottom.querySelector(".go-btn")!,
      sprayInfo: bottom.querySelector(".spray-info")!,
      banner,
      modal,
      hintBtn: bottom.querySelector(".hint-btn")!,
      wave: top.querySelector(".wave-chip")!,
      hearts: top.querySelector(".hearts")!,
    };
    top.addEventListener("click", (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>("[data-act]")?.dataset.act;
      if (act === "pause") this.pause();
      if (act === "retry") this.retry();
    });
    bottom.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const act = target.closest<HTMLElement>("[data-act]")?.dataset.act;
      if (act === "hint") this.useHint();
      const booster = target.closest<HTMLElement>("[data-booster]")?.dataset.booster as BoosterId | undefined;
      if (booster) this.toggleBooster(booster);
    });
    this.hud.go.addEventListener("click", () => {
      this.sim.release();
      this.app.audio.release();
    });
  }

  private renderTray(): void {
    const tray = this.hud.tray;
    const locked = this.sim.phase !== "plan" || this.sim.inks.length > 0 || (this.stroke?.started ?? false);
    if (locked && this.mode === "campaign") {
      tray.innerHTML = "";
      tray.hidden = true;
      return;
    }
    tray.hidden = false;
    tray.innerHTML = BOOSTER_ORDER.map((id) => {
      const info = BOOSTERS[id];
      const count = this.app.save.boosters[id] ?? 0;
      const on = this.selected.has(id);
      const disabled = this.mode === "endless" && (this.sim.wave > 1 || locked);
      return `<button class="booster ${on ? "on" : ""} ${count === 0 ? "empty" : ""}" data-booster="${id}" ${disabled ? "disabled" : ""} title="${info.name}：${info.desc}">
        <i>${info.icon}</i><span>${count > 0 ? `×${count}` : `🍯${info.price}`}</span></button>`;
    }).join("");
    if (this.mode === "endless" && this.sim.wave > 1) tray.hidden = true;
  }

  private toggleBooster(id: BoosterId): void {
    if (this.sim.phase !== "plan" || this.sim.inks.length > 0) return;
    const save = this.app.save;
    if (this.selected.has(id)) {
      this.selected.delete(id);
    } else {
      if ((save.boosters[id] ?? 0) <= 0) {
        const price = BOOSTERS[id].price;
        if (save.honey < price) {
          this.toast(`蜂蜜不够啦（需要 ${price}🍯）`);
          return;
        }
        save.honey -= price;
        save.boosters[id] = 1;
        this.app.persist();
        this.app.audio.coin();
        this.toast(`买了一个${BOOSTERS[id].name}`);
      }
      this.selected.add(id);
      this.toast(`${BOOSTERS[id].icon} ${BOOSTERS[id].name}：${BOOSTERS[id].desc}`);
    }
    this.app.audio.click();
    this.newAttempt();
  }

  private consumeBoosters(): void {
    if (this.boostersConsumed) return;
    this.boostersConsumed = true;
    for (const id of this.selected) this.app.save.boosters[id] = Math.max(0, (this.app.save.boosters[id] ?? 0) - 1);
    if (this.selected.size > 0) this.app.persist();
  }

  private useHint(): void {
    if (this.mode !== "campaign" || this.showHint) return;
    const save = this.app.save;
    const free = (save.fails[this.level.id] ?? 0) >= 3;
    if (!free) {
      if (save.honey < HINT_PRICE) {
        this.toast(`提示需要 ${HINT_PRICE}🍯，失败 3 次后免费`);
        return;
      }
      save.honey -= HINT_PRICE;
    }
    save.hinted.push(this.level.id);
    this.app.persist();
    this.showHint = true;
    this.app.audio.coin();
    this.toast(free ? "免费提示：照着虚线画试试！" : `花费 ${HINT_PRICE}🍯：照着虚线画试试！`);
  }

  private toast(text: string): void {
    const t = el("div", "toast", escapeHtml(text));
    this.root.append(t);
    setTimeout(() => t.remove(), 1900);
  }

  private updateHud(force = false): void {
    const sim = this.sim;
    const hud = this.hud;
    const surviving = sim.phase === "survive";
    const left = surviving ? Math.max(0, sim.duration - sim.time) : sim.phase === "plan" ? sim.duration : 0;
    const timerText = String(Math.ceil(left - 1e-6));
    if (force || timerText !== this.lastHud.timer) {
      hud.timer.textContent = timerText;
      hud.timer.parentElement!.classList.toggle("urgent", surviving && left <= 3);
      this.lastHud.timer = timerText;
    }
    const frac = surviving ? left / sim.duration : sim.phase === "plan" ? 1 : 0;
    hud.timerRing.style.strokeDashoffset = String(264 * (1 - frac));

    const drawing = this.stroke?.length ?? 0;
    const remaining = Math.max(0, sim.inkBudget - sim.inkUsed - drawing);
    const inkFrac = remaining / sim.inkBudget;
    if (force || Math.abs(inkFrac - this.lastHud.ink) > 0.002) {
      hud.inkFill.style.width = `${inkFrac * 100}%`;
      const parFrac = this.mode === "campaign" ? Math.max(0, 1 - this.level.par / sim.inkBudget) : -1;
      hud.inkPar.style.left = `${parFrac * 100}%`;
      hud.inkPar.hidden = parFrac <= 0;
      hud.inkFill.classList.toggle("over-par", this.mode === "campaign" && sim.inkUsed + drawing > this.level.par);
      hud.inkText.textContent = `${Math.round(inkFrac * 100)}%`;
      this.lastHud.ink = inkFrac;
    }

    const heartsKey = sim.pets.map((pt) => `${pt.kind}:${pt.hearts}/${pt.maxHearts}:${pt.shield}`).join("|");
    if (force || heartsKey !== this.lastHud.hearts) {
      this.lastHud.hearts = heartsKey;
      hud.hearts.innerHTML = sim.pets
        .map((pt) => {
          let h = "";
          for (let i = 0; i < pt.maxHearts; i++) h += `<i class="${i < pt.hearts ? "on" : ""}">❤</i>`;
          return `<div class="heart-row"><span>${PET_INFO[pt.kind].name}</span>${h}${pt.shield > 0 ? `<b>🫧${pt.shield}</b>` : ""}</div>`;
        })
        .join("");
    }

    const phaseKey = `${sim.phase}|${sim.inks.length}|${this.stroke?.started ? 1 : 0}|${sim.strokesLeft}|${sim.sprayCharges}|${this.showHint}|${sim.wave}`;
    if (force || phaseKey !== this.lastHud.phase) {
      this.lastHud.phase = phaseKey;
      const planning = sim.phase === "plan";
      const fresh = planning && sim.inks.length === 0 && !this.stroke?.started;
      hud.tip.textContent = this.level.tip;
      hud.tip.hidden = !fresh;
      const multi = (this.level.strokes ?? 1) > 1;
      hud.go.hidden = !(planning && multi && sim.inks.length > 0 && sim.strokesLeft > 0 && !this.stroke?.started);
      if (!hud.go.hidden) hud.go.textContent = `开始守护！（还能画 ${sim.strokesLeft} 笔）`;
      hud.sprayInfo.hidden = !(surviving && sim.sprayCharges > 0);
      hud.sprayInfo.querySelector("b")!.textContent = `×${sim.sprayCharges}`;
      hud.hintBtn.classList.toggle("used", this.showHint);
      hud.wave.textContent = `第 ${sim.wave} 波`;
      this.renderTray();
    }
  }

  // ------------------------------------------------------------ input

  private toWorld(e: PointerEvent): Vec {
    const rect = this.app.canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * VIEW_W, y: ((e.clientY - rect.top) / rect.height) * VIEW_H };
  }

  private readonly onDown = (e: PointerEvent): void => {
    this.app.audio.unlock();
    if (this.paused || this.resultShown) return;
    const p = this.toWorld(e);
    const sim = this.sim;
    if (sim.phase === "survive" && sim.sprayCharges > 0) {
      if (sim.spray(p)) this.app.audio.spray();
      return;
    }
    if (sim.phase !== "plan" || sim.strokesLeft <= 0 || this.pointerId !== undefined) return;
    try {
      this.app.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic or already-released pointers cannot be captured; drawing still works.
    }
    this.pointerId = e.pointerId;
    this.stroke = new StrokeBuilder(sim.obstacles(), sim.inkLeft);
    if (!this.stroke.start(p)) this.app.audio.blocked();
    this.lastMove = { x: p.x, y: p.y, t: performance.now() };
    this.app.audio.drawStart();
    this.updateHud();
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId || !this.stroke) return;
    const events = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
    for (const ce of events.length > 0 ? events : [e]) {
      const p = this.toWorld(ce);
      const wasBlocked = this.stroke.blocked;
      this.stroke.extend(p);
      if (this.stroke.blocked && !wasBlocked) this.app.audio.blocked();
    }
    const p = this.toWorld(e);
    const now = performance.now();
    const dtm = Math.max(1, now - this.lastMove.t);
    this.app.audio.drawSpeed(this.stroke.empty || this.stroke.blocked ? 0 : (Math.hypot(p.x - this.lastMove.x, p.y - this.lastMove.y) / dtm) * 1000);
    this.lastMove = { x: p.x, y: p.y, t: now };
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = undefined;
    this.app.audio.drawEnd();
    const stroke = this.stroke;
    this.stroke = undefined;
    if (!stroke) return;
    const points = stroke.finish();
    if (!points) {
      if (stroke.started) this.toast("线太短啦，再画长一点");
      this.updateHud(true);
      return;
    }
    this.strokesThisAttempt.push(points.map((pt) => ({ x: pt.x, y: pt.y })));
    this.sim.commitStroke(points);
    if (this.sim.phase === "survive") this.app.audio.release();
    else this.app.audio.click();
    this.updateHud(true);
  };

  key(e: KeyboardEvent): void {
    if (e.key === "r" || e.key === "R") this.retry();
    else if (e.key === "Escape") {
      if (this.paused) this.resume();
      else this.pause();
    } else if (e.key === " " && this.sim.phase === "plan" && this.sim.inks.length > 0) this.sim.release();
  }

  // ------------------------------------------------------------ frame

  frame(dt: number): void {
    const sim = this.sim;
    if (!this.paused) {
      let scale = 1;
      if (sim.phase === "lost" && sim.endT < 0.6) scale = 0.3;
      this.acc += Math.min(dt, 0.1) * scale;
      let steps = 0;
      while (this.acc >= DT && steps < 5) {
        sim.step();
        this.acc -= DT;
        steps++;
      }
      if (sim.phase === "plan") this.acc = 0;
      this.handleEvents(sim.drainEvents());
    }
    this.updateBuzz();
    const view = {
      stroke: this.stroke && this.stroke.started ? { points: this.stroke.points, blocked: this.stroke.blocked, cursor: this.stroke.cursor } : undefined,
      hint: this.showHint && sim.phase === "plan" ? this.level.solution : undefined,
      ghost: sim.phase === "plan" && !this.showHint ? this.ghost : undefined,
      showThreats: sim.phase === "plan",
    };
    this.app.renderer.draw(sim, view, this.paused ? 0 : dt);
    this.updateHud();

    if (sim.phase === "intermission" && this.director) {
      this.intermissionT += dt;
      if (this.intermissionT > 1.8) {
        this.intermissionT = 0;
        this.director.nextWave();
        this.hud.banner.className = "banner";
        this.updateHud(true);
      }
    }
    if (!this.resultShown && (sim.phase === "won" || sim.phase === "lost") && sim.endT > (sim.phase === "won" ? 1.5 : 1.0)) {
      this.resultShown = true;
      this.showResult();
    }
  }

  private updateBuzz(): void {
    const sim = this.sim;
    if (this.paused || sim.phase === "plan") {
      this.app.audio.setBuzz(0);
      return;
    }
    let near = 0;
    const pet = sim.pets[0];
    for (const b of sim.bees) {
      if (b.state !== "fly" || !pet) continue;
      const d = Math.hypot(b.x - pet.x, b.y - pet.y);
      near += d < 500 ? 1 - d / 500 : 0;
    }
    this.app.audio.setBuzz(Math.min(1, near / 12));
  }

  private handleEvents(events: SimEvent[]): void {
    if (events.length === 0) return;
    this.app.renderer.react(events);
    const audio = this.app.audio;
    for (const e of events) {
      switch (e.type) {
        case "release":
          this.consumeBoosters();
          this.updateHud(true);
          break;
        case "sting":
          audio.sting();
          navigator.vibrate?.(30);
          break;
        case "hurt":
          audio.hurt();
          navigator.vibrate?.(40);
          break;
        case "shieldPop":
          audio.shieldPop();
          break;
        case "bump":
          audio.bump(e.power);
          break;
        case "explode":
          audio.explode();
          navigator.vibrate?.(80);
          break;
        case "chomp":
          audio.chomp();
          break;
        case "splash":
          audio.splash();
          break;
        case "tongue":
          audio.tongue(e.hit);
          break;
        case "warn":
          audio.warn();
          break;
        case "pin":
          audio.pin();
          break;
        case "inkCut":
          audio.snap();
          break;
        case "crumble":
        case "shatter":
          audio.crack();
          break;
        case "tick":
          audio.tick(e.n);
          break;
        case "won":
          audio.win();
          break;
        case "lost":
          audio.lose();
          break;
        case "wave": {
          audio.win();
          const honey = ENDLESS_HONEY_PER_WAVE;
          this.honeyThisRun += honey;
          this.app.save.honey += honey;
          this.app.save.endlessBest = Math.max(this.app.save.endlessBest, e.n);
          this.app.persist();
          this.hud.banner.innerHTML = `<b>第 ${e.n} 波 守住了！</b><span>+${honey}🍯 · 墨水已补充</span>`;
          this.hud.banner.className = "banner show";
          break;
        }
        default:
          break;
      }
    }
  }

  // ------------------------------------------------------------ overlays

  private pause(): void {
    if (this.resultShown || this.paused) return;
    this.paused = true;
    this.app.audio.click();
    const save = this.app.save;
    const modal = this.hud.modal;
    modal.hidden = false;
    modal.innerHTML = `<div class="card pause-card">
      <h2>暂停一下</h2>
      <button class="btn primary" data-act="resume">继续</button>
      <button class="btn" data-act="retry">重新开始</button>
      <button class="btn" data-act="map">${this.mode === "endless" ? "返回首页" : "选择关卡"}</button>
      <div class="toggles">
        <button class="toggle ${save.sound ? "on" : ""}" data-act="sound">🔊 音效</button>
        <button class="toggle ${save.music ? "on" : ""}" data-act="music">🎵 音乐</button>
      </div></div>`;
    modal.onclick = (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>("[data-act]")?.dataset.act;
      if (act === "resume") this.resume();
      else if (act === "retry") {
        this.resume();
        this.retry();
      } else if (act === "map") {
        this.app.audio.click();
        if (this.mode === "endless") this.app.showTitle();
        else this.app.showMap(this.level.world);
      } else if (act === "sound" || act === "music") {
        if (act === "sound") this.app.setSound(!save.sound);
        else this.app.setMusic(!save.music);
        (e.target as HTMLElement).closest(".toggle")!.classList.toggle("on");
      }
    };
  }

  private resume(): void {
    this.paused = false;
    this.hud.modal.hidden = true;
    this.hud.modal.innerHTML = "";
    this.hud.modal.onclick = null;
  }

  private showResult(): void {
    const sim = this.sim;
    const outcome = sim.outcome!;
    const modal = this.hud.modal;
    modal.hidden = false;
    const save = this.app.save;

    if (this.mode === "endless") {
      const waves = this.director?.cleared ?? 0;
      const best = save.endlessBest;
      modal.innerHTML = `<div class="card result lose">
        <div class="result-pet"></div>
        <h2>坚持了 ${waves} 波！</h2>
        <p class="sub">${waves >= best && waves > 0 ? "🎉 新纪录！" : `最高纪录：${best} 波`}</p>
        <p class="reward">本局获得 <b>${this.honeyThisRun}🍯</b></p>
        <button class="btn primary" data-act="retry">再来一局</button>
        <button class="btn" data-act="home">返回首页</button>
      </div>`;
      modal.querySelector(".result-pet")!.append(petPortrait(this.app.save.pet, 110, "hurt"));
      modal.onclick = (e) => {
        const act = (e.target as HTMLElement).closest<HTMLElement>("[data-act]")?.dataset.act;
        if (act === "retry") this.retry();
        if (act === "home") this.app.showTitle();
      };
      return;
    }

    if (outcome.won) {
      const reward = recordWin(save, this.level.id, outcome.stars, outcome.inkUsed);
      const world = this.level.world;
      const worldLevels = levelsOfWorld(world);
      const worldDone = worldLevels.every((l) => (save.stars[l.id] ?? 0) > 0);
      const unlock = worldOf(world).unlockPet;
      let unlockHtml = "";
      if (worldDone && !save.pets.includes(unlock)) {
        save.pets.push(unlock);
        unlockHtml = `<div class="unlock"><div class="unlock-pet"></div><p>解锁新萌宠：<b>${PET_INFO[unlock].name}</b>！<br><small>去萌宠小屋换上它吧</small></p></div>`;
      }
      this.app.persist();
      const next = nextLevel(this.level.id);
      const checks = [
        ["守护成功", true],
        [`毫发无伤`, outcome.noDamage],
        [`省墨（≤ ${outcome.par}）`, outcome.underPar],
      ] as const;
      const titles = ["过关！", "干得漂亮！", "完美守护！"];
      modal.innerHTML = `<div class="card result win">
        <div class="ribbon">${this.level.world}-${this.level.index} ${escapeHtml(this.level.name)}</div>
        <div class="big-stars">${starsHtml(0)}</div>
        <h2>${titles[outcome.stars - 1]}</h2>
        <ul class="checks">${checks.map(([t, ok]) => `<li class="${ok ? "ok" : ""}">${ok ? "★" : "☆"} ${t}</li>`).join("")}</ul>
        <p class="reward">+${reward.honey}🍯 <small>共 ${save.honey}🍯</small></p>
        ${unlockHtml}
        <div class="row">
          <button class="btn" data-act="map">关卡</button>
          <button class="btn" data-act="retry">重玩</button>
          ${next ? `<button class="btn primary" data-act="next">下一关 ▶</button>` : `<button class="btn primary" data-act="map">全部通关！</button>`}
        </div></div>`;
      if (unlockHtml) modal.querySelector(".unlock-pet")!.append(petPortrait(unlock, 72, "happy"));
      const stars = [...modal.querySelectorAll<HTMLElement>(".big-stars .star")];
      stars.forEach((s, i) => {
        if (i >= outcome.stars) return;
        setTimeout(() => {
          s.classList.add("on", "pop");
          this.app.audio.starPing(i);
        }, 350 + i * 330);
      });
      modal.onclick = (e) => {
        const act = (e.target as HTMLElement).closest<HTMLElement>("[data-act]")?.dataset.act;
        if (act === "retry") {
          this.ghost = this.strokesThisAttempt.map((s) => s.slice());
          this.newAttempt();
        } else if (act === "map") this.app.showMap(this.level.world);
        else if (act === "next" && next) this.app.playLevel(next);
      };
      return;
    }

    save.fails[this.level.id] = (save.fails[this.level.id] ?? 0) + 1;
    this.app.persist();
    const text = DEATH_TEXT[outcome.reason ?? "stung"];
    const fails = save.fails[this.level.id]!;
    const hintFree = fails >= 3 && !this.showHint;
    const suggest = this.suggestBooster(outcome.reason);
    modal.innerHTML = `<div class="card result lose">
      <div class="result-pet"></div>
      <h2>${text.title}</h2>
      <p class="sub">${escapeHtml(text.tip)}</p>
      ${suggest ? `<p class="suggest">试试 <b>${BOOSTERS[suggest].icon} ${BOOSTERS[suggest].name}</b>：${BOOSTERS[suggest].desc}</p>` : ""}
      <button class="btn primary" data-act="retry">再试一次 <kbd>R</kbd></button>
      <div class="row">
        <button class="btn" data-act="map">关卡</button>
        ${this.showHint ? "" : `<button class="btn" data-act="hint">💡 ${hintFree ? "免费提示" : `提示 ${HINT_PRICE}🍯`}</button>`}
      </div></div>`;
    const portrait = petPortrait(sim.pets.find((pt) => !pt.alive)?.kind ?? sim.pets[0]?.kind ?? "hamster", 110, "hurt");
    modal.querySelector(".result-pet")!.append(portrait);
    modal.onclick = (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>("[data-act]")?.dataset.act;
      if (act === "retry") this.retry();
      else if (act === "map") this.app.showMap(this.level.world);
      else if (act === "hint") {
        this.retry();
        this.useHint();
      }
    };
  }

  private suggestBooster(reason: string | undefined): BoosterId | undefined {
    const pick: BoosterId = reason === "stung" ? "shield" : reason === "fell" || reason === "drowned" || reason === "burned" ? "steel" : "shield";
    return this.selected.has(pick) ? undefined : pick;
  }
}
