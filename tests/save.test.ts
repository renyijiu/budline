import { describe, expect, test } from "vitest";

import { SAVE_KEY, defaultSave, loadSave, recordWin, totalStars, writeSave } from "../src/app/save";

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe("save", () => {
  test("round-trips through storage", () => {
    const storage = memoryStorage();
    const save = defaultSave();
    save.honey = 999;
    save.stars["1-1"] = 3;
    writeSave(save, storage);
    const loaded = loadSave(storage);
    expect(loaded.honey).toBe(999);
    expect(loaded.stars["1-1"]).toBe(3);
  });

  test("falls back to defaults on corrupt data", () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, "{not json");
    expect(loadSave(storage)).toEqual(defaultSave());
  });

  test("rewards only newly earned stars", () => {
    const save = defaultSave();
    const start = save.honey;
    const first = recordWin(save, "1-1", 2, 300);
    expect(first.newStars).toBe(2);
    expect(first.honey).toBe(25);
    const again = recordWin(save, "1-1", 2, 280);
    expect(again.newStars).toBe(0);
    expect(again.honey).toBe(3);
    const better = recordWin(save, "1-1", 3, 260);
    expect(better.newStars).toBe(1);
    expect(save.honey).toBe(start + 25 + 3 + 10);
    expect(save.stars["1-1"]).toBe(3);
    expect(save.bestInk["1-1"]).toBe(260);
    expect(totalStars(save)).toBe(3);
  });
});
