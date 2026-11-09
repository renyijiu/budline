import type { PetKind } from "../game/levels/types";
import { drawPet } from "../game/render/art";
import type { BoosterId, DeathReason, Mood } from "../game/sim/types";

export const BOOSTERS: Record<BoosterId, { name: string; icon: string; desc: string; price: number }> = {
  ink: { name: "加墨水", icon: "🖋️", desc: "墨水上限 +45%", price: 30 },
  steel: { name: "钢铁笔", icon: "🔩", desc: "画出的线固定在空中，不会掉", price: 60 },
  shield: { name: "泡泡盾", icon: "🫧", desc: "替萌宠挡下 3 次伤害", price: 40 },
  spray: { name: "驱蜂喷雾", icon: "💨", desc: "守护时点击屏幕喷雾，可用 2 次", price: 35 },
  time: { name: "沙漏", icon: "⏳", desc: "本关守护时间 -3 秒", price: 45 },
};

export const BOOSTER_ORDER: BoosterId[] = ["shield", "ink", "steel", "spray", "time"];

export const PET_PRICES: Record<PetKind, { price: number; world: number }> = {
  hamster: { price: 0, world: 0 },
  chick: { price: 150, world: 1 },
  piglet: { price: 200, world: 2 },
  bunny: { price: 250, world: 3 },
  panda: { price: 300, world: 4 },
  kitten: { price: 350, world: 5 },
};

export const PET_ORDER: PetKind[] = ["hamster", "chick", "piglet", "bunny", "panda", "kitten"];

export const DEATH_TEXT: Record<DeathReason, { title: string; tip: string }> = {
  stung: { title: "被蜜蜂蜇哭了！", tip: "看看蜜蜂从哪儿钻进来的——把线的两端接到地面或墙上，就没有缝了。" },
  eaten: { title: "被鳄鱼一口吞了！", tip: "鳄鱼咬不穿墨线。挡在它和萌宠之间，最好让线有地方借力。" },
  drowned: { title: "扑通，掉进水里了！", tip: "线会被推着走。给它找个支点，别让它把萌宠挤下去。" },
  burned: { title: "好烫好烫！", tip: "离岩浆远一点，别让墨线把萌宠推过去。" },
  spiked: { title: "被尖刺扎到了！", tip: "萌宠被挤到了尖刺上，试着把线画得更稳一些。" },
  fell: { title: "掉出画面了！", tip: "萌宠被推下去了。线太重或太斜时，会把它挤走。" },
  blast: { title: "被炸飞了！", tip: "炸弹的冲击会被墨线挡住，在萌宠和炸弹之间留一道墙。" },
  crushed: { title: "被大石头压扁了！", tip: "石头正面撞上会把墨线撞断。画一道缓坡，让它擦着线飞过去。" },
  tongue: { title: "被青蛙舌头弹中了！", tip: "青蛙的舌头是直线，任何一段墨线都能挡住它。" },
  impaled: { title: "被冰锥砸中了！", tip: "冰锥正面砸下来会把墨线砸断。把屋顶画得陡一点，让冰锥顺着坡滑下去。" },
};

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, html?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

export function starsHtml(n: number, max = 3): string {
  let out = "";
  for (let i = 0; i < max; i++) out += `<span class="star ${i < n ? "on" : ""}">★</span>`;
  return out;
}

/** Renders a pet portrait into a fresh canvas. */
export function petPortrait(kind: PetKind, size = 96, mood: Mood = "idle"): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
  canvas.width = size * ratio;
  canvas.height = size * ratio;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext("2d")!;
  ctx.scale((size * ratio) / 120, (size * ratio) / 120);
  ctx.translate(60, 66);
  drawPet(ctx, { kind, mood, look: { x: 0, y: 0 }, t: 0, squash: 1, blink: false, shake: 0 });
  return canvas;
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
