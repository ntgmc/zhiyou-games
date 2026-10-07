import { analyze, cloneRoutes, execute, routeError, walk } from "./engine.js";
import type { Result, Route } from "./engine.js";
import { MISSIONS } from "./missions.js";
import { freshGuide, readGuide } from "./story.js";
import type { Guide } from "./story.js";
import { readChapters, type ChapterDrafts } from "../../shared/chapter-drafts.js";

export interface Save {
  version: 1;
  activeId: number;
  unlocked: number;
  best: Record<string, number>;
  solo: Record<string, number>;
  routes: Route[];
  codes: string[];
  amount: number;
  editing: "route" | number | "residual"; // Preserve the legacy value when validating old backups.
  side: string[];
  guide: Guide;
  mode: "story" | "desk";
  hintLevel: number;
  hinted: boolean;
  result: Result | null;
  chapters?: ChapterDrafts;
}
export const SAVE_KEY = "mountain-network-save-v1";
export function freshSave(): Save {
  return { version: 1, activeId: 1, unlocked: 1, best: {}, solo: {}, routes: [], codes: [], amount: 1,
    editing: "route", side: ["S"], guide: freshGuide(), mode: "story", hintLevel: 0, hinted: false, result: null };
}
export function startChapter(save: Save, id: number): void {
  const mission = MISSIONS.find((item) => item.id === id);
  if (!mission) throw new Error("章节不存在。");
  save.activeId = id;
  save.routes = cloneRoutes(mission.seed ?? []);
  save.codes = [];
  save.amount = 1;
  save.editing = "route";
  save.side = [mission.source];
  save.guide = freshGuide();
  save.hintLevel = 0;
  save.hinted = false;
  save.result = null;
}
export function recordScore(save: Save): void {
  if (!save.result?.passed) return;
  save.best[save.activeId] = Math.max(save.best[save.activeId] ?? 0, save.result.stars);
  if (!save.hinted) save.solo[save.activeId] = Math.max(save.solo[save.activeId] ?? 0, save.result.stars);
  save.unlocked = Math.max(save.unlocked, Math.min(MISSIONS.length, save.activeId + 1));
}
function scores(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id, score]) =>
    MISSIONS.some((mission) => String(mission.id) === id) && (score === 2 || score === 3)));
}
export function readSave(key: string, storage?: Pick<Storage, "getItem">): Save {
  const save = freshSave();
  try {
    const data = JSON.parse((storage ?? localStorage).getItem(key) ?? "null");
    if (!data || data.version !== 1) return save;
    const chapters = readChapters(data.chapters, MISSIONS.length);
    if (chapters) save.chapters = chapters;
    save.best = scores(data.best);
    save.solo = scores(data.solo);
    for (const id of Object.keys(save.solo)) if ((save.best[id] ?? 0) < save.solo[id]) delete save.solo[id];
    save.unlocked = Math.min(MISSIONS.length, Math.max(1, ...Object.keys(save.best).map((id) => Number(id) + 1)));
    const mission = MISSIONS.find((item) => item.id === data.activeId);
    if (!mission) return save;
    startChapter(save, mission.id);
    save.mode = data.mode === "desk" ? "desk" : "story";
    if (!Array.isArray(data.routes) || data.routes.length > 64 || data.routes.some((route: unknown) => routeError(mission, route))) return save;
    save.routes = cloneRoutes(data.routes);
    save.guide = readGuide(data.guide, mission.id);
    if (Number.isInteger(data.editing) && data.editing >= 0 && data.editing < save.routes.length) save.editing = data.editing;
    else if (data.editing === "residual" && mission.id >= 5) save.editing = "residual";
    if (Array.isArray(data.codes) && walk(mission, data.codes, save.editing === "residual")) save.codes = [...data.codes];
    if (Number.isInteger(data.amount) && data.amount >= 1 && data.amount <= 100) save.amount = data.amount;
    if (Array.isArray(data.side) && data.side.includes(mission.source) && new Set(data.side).size === data.side.length
      && data.side.every((id: unknown) => typeof id === "string" && mission.places.some((place) => place.id === id && !place.need))) save.side = [...data.side];
    save.hintLevel = Number.isInteger(data.hintLevel) && data.hintLevel >= 0 && data.hintLevel <= 3 ? data.hintLevel : 0;
    save.hinted = data.hinted === true || save.hintLevel > 0;
    if (data.result && !analyze(mission, save.routes).errors.length) {
      save.result = execute(mission, save.routes, save.side);
      recordScore(save);
    }
    return save;
  } catch { return save; }
}
export function writeSave(key: string, save: Save, storage?: Pick<Storage, "setItem">): boolean {
  try { (storage ?? localStorage).setItem(key, JSON.stringify(save)); return true; } catch { return false; }
}
