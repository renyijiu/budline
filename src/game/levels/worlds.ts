import type { WorldDef } from "./types";

export const WORLDS: WorldDef[] = [
  {
    id: 1,
    name: "阳光草地",
    subtitle: "蜂巢就挂在树上",
    unlockPet: "chick",
    theme: { skyTop: "#7fd0ff", skyBottom: "#e9f9ff", far: "#a9e28c", near: "#86d06e", accent: "#ffd23f", scenery: "meadow" },
  },
  {
    id: 2,
    name: "荷叶池塘",
    subtitle: "水里有东西在看着你",
    unlockPet: "piglet",
    theme: { skyTop: "#8fe3d8", skyBottom: "#f1fff9", far: "#97d7b0", near: "#6dc08f", accent: "#5fd0ff", scenery: "pond" },
  },
  {
    id: 3,
    name: "熔岩火山",
    subtitle: "炸弹、落石和暴躁的胡蜂",
    unlockPet: "bunny",
    theme: { skyTop: "#ff9e7a", skyBottom: "#ffe9cf", far: "#8c5b6c", near: "#6e4659", accent: "#ff7a3d", scenery: "volcano" },
  },
  {
    id: 4,
    name: "冰雪山巅",
    subtitle: "又滑又冷，还刮大风",
    unlockPet: "panda",
    theme: { skyTop: "#9fcdff", skyBottom: "#f4f9ff", far: "#cddff5", near: "#aac6e8", accent: "#8fd3ff", scenery: "snow" },
  },
  {
    id: 5,
    name: "萤火之夜",
    subtitle: "所有危险一起出场",
    unlockPet: "kitten",
    theme: { skyTop: "#1c2452", skyBottom: "#5a4688", far: "#33397a", near: "#272c62", accent: "#c9a7ff", scenery: "night" },
  },
];

export function worldOf(id: number): WorldDef {
  return WORLDS.find((w) => w.id === id) ?? WORLDS[0]!;
}
