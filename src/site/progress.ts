import type { GameEntry } from "./catalog.js";

export function savedChapter(game: GameEntry, testing: boolean, storage?: Pick<Storage, "getItem">): number | null {
  try {
    const value = JSON.parse((storage ?? localStorage).getItem(testing ? game.testKey : game.saveKey) ?? "null");
    if (!value || value.version !== 1 || !Number.isInteger(value.activeId) || value.activeId < 1 || value.activeId > game.chapters) return null;
    if (game.id === "information" || game.id === "game-theory") {
      if (value.session?.missionId !== value.activeId || !Array.isArray(value.session.history)) return null;
    } else if (!Array.isArray(game.id === "probability" ? value.plans : value.routes)) return null;
    return value.activeId;
  } catch { return null; }
}
