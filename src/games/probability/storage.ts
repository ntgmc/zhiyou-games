import { defaultPlan, execute, planError } from "./engine.js";
import type { Plan, Result } from "./engine.js";
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
  plans: Plan[];
  guide: Guide;
  hintLevel: number;
  hinted: boolean;
  mode: "story" | "desk";
  result: Result | null;
  chapters?: ChapterDrafts;
}
export const SAVE_KEY = "repair-station-save-v1";
export function freshSave(): Save {
  return { version: 1, activeId: 1, unlocked: 1, best: {}, solo: {}, plans: MISSIONS[0].cases.map(defaultPlan),
    guide: freshGuide(), hintLevel: 0, hinted: false, mode: "story", result: null };
}
export function startChapter(save: Save, id: number): void {
  const mission = MISSIONS.find((item) => item.id === id);
  if (!mission) throw new Error("找不到这一章，请从章节列表重新选择。");
  save.activeId = id;
  save.plans = mission.cases.map(defaultPlan);
  save.guide = freshGuide();
  save.hintLevel = 0;
  save.hinted = false;
  save.result = null;
}
export function recordScore(save: Save): void {
  if (!save.result?.passed) return;
  const score = save.result.stars;
  save.best[save.activeId] = Math.max(save.best[save.activeId] ?? 0, score);
  if (!save.hinted) save.solo[save.activeId] = Math.max(save.solo[save.activeId] ?? 0, score);
  save.unlocked = Math.max(save.unlocked, Math.min(MISSIONS.length, save.activeId + 1));
}
function scores(value: unknown): Record<string, number> {
  const result: Record<string, number> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const [id, score] of Object.entries(value)) {
    if (MISSIONS.some((mission) => String(mission.id) === id) && (score === 2 || score === 3)) result[id] = score;
  }
  return result;
}
export function readSave(key: string, storage?: Pick<Storage, "getItem">): Save {
  const fallback = freshSave();
  try {
    const data = JSON.parse((storage ?? localStorage).getItem(key) ?? "null");
    if (!data || data.version !== 1) return fallback;
    const chapters = readChapters(data.chapters, MISSIONS.length);
    if (chapters) fallback.chapters = chapters;
    fallback.best = scores(data.best);
    fallback.solo = scores(data.solo);
    for (const id of Object.keys(fallback.solo)) {
      if ((fallback.best[id] ?? 0) < fallback.solo[id]) delete fallback.solo[id];
    }
    const completed = Object.keys(fallback.best).map(Number);
    fallback.unlocked = Math.min(MISSIONS.length, Math.max(1, ...completed.map((id) => id + 1)));
    if (Number.isInteger(data.unlocked) && data.unlocked >= fallback.unlocked && data.unlocked <= MISSIONS.length) fallback.unlocked = data.unlocked;
    const mission = MISSIONS.find((item) => item.id === data.activeId);
    if (!mission) return fallback;
    startChapter(fallback, mission.id);
    fallback.mode = data.mode === "desk" ? "desk" : "story";
    if (!Array.isArray(data.plans) || data.plans.length !== mission.cases.length
      || data.plans.some((plan: unknown, i: number) => planError(mission.cases[i], plan as Plan))) return fallback;
    fallback.plans = data.plans.map((plan: Plan) => ({ detectorId: plan.detectorId, red: plan.red, green: plan.green, samples: plan.samples, cutoff: plan.cutoff }));
    fallback.guide = readGuide(data.guide, mission.id);
    fallback.hintLevel = Number.isInteger(data.hintLevel) && data.hintLevel >= 0 && data.hintLevel <= 3 ? data.hintLevel : 0;
    fallback.hinted = data.hinted === true || fallback.hintLevel > 0;
    if (data.result) {
      try {
        fallback.result = execute(mission, fallback.plans);
        recordScore(fallback);
      } catch { fallback.result = null; }
    }
    return fallback;
  } catch { return fallback; }
}
export function writeSave(key: string, save: Save, storage?: Pick<Storage, "setItem">): boolean {
  try { (storage ?? localStorage).setItem(key, JSON.stringify(save)); return true; } catch { return false; }
}
