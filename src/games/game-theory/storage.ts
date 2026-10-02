import { createSession, defaultPlan, settle, stars, validPlan } from "./engine.js";
import type { Plan, Session } from "./engine.js";
import { MISSIONS } from "./missions.js";
import { freshGuide, readGuide } from "./story.js";
import type { Guide } from "./story.js";
import { readChapters, type ChapterDrafts } from "../../shared/chapter-drafts.js";

export interface Save {
  version: 1;
  activeId: number;
  best: { [id: string]: number };
  solo: { [id: string]: number };
  session: Session;
  draft: Plan;
  hintLevel: number;
  review: boolean;
  mode: "story" | "desk";
  guide: Guide;
  chapters?: ChapterDrafts;
}
export const SAVE_KEY = "tidal-harbor-save-v1";
export function freshSave(): Save {
  return { version: 1, activeId: 1, best: {}, solo: {}, session: createSession(MISSIONS[0]), draft: defaultPlan(), hintLevel: 0, review: false, mode: "story", guide: freshGuide() };
}
export function readSave(key: string, storage?: Pick<Storage, "getItem">): Save {
  const fallback = freshSave();
  try {
    const data = JSON.parse((storage ?? localStorage).getItem(key) ?? "null");
    if (!data || data.version !== 1 || !Number.isInteger(data.activeId)
      || !MISSIONS.some((mission) => mission.id === data.activeId)) return fallback;
    for (const field of ["best", "solo"] as const) {
      if (!data[field] || typeof data[field] !== "object" || Array.isArray(data[field])) return fallback;
      for (const [id, score] of Object.entries(data[field])) {
        if (!MISSIONS.some((mission) => String(mission.id) === id) || !Number.isInteger(score) || Number(score) < 1 || Number(score) > 3) return fallback;
      }
    }
    const mission = MISSIONS[data.activeId - 1];
    const chapters = readChapters(data.chapters, MISSIONS.length);
    if (chapters) fallback.chapters = chapters;
    // A damaged current voyage must not erase already validated achievements.
    fallback.activeId = mission.id;
    fallback.best = data.best;
    fallback.solo = data.solo;
    fallback.session = createSession(mission);
    fallback.mode = data.mode === "story" ? "story" : "desk";
    const history = data.session?.history;
    if (data.session?.missionId !== data.activeId || !Array.isArray(history) || history.length > mission.rounds.length
      || typeof data.session.hinted !== "boolean" || !Number.isInteger(data.hintLevel) || data.hintLevel < 0 || data.hintLevel > 3
      || !validPlan(data.draft) || typeof data.review !== "boolean") return fallback;
    // Rebuild the ledger from legal decisions rather than trusting saved cash or outcomes.
    let session = createSession(mission);
    session.hinted = data.session.hinted || data.hintLevel > 0;
    for (const item of history) {
      if (!validPlan(item?.plan)) return fallback;
      session = settle(session, mission, item.plan);
    }
    return { version: 1, activeId: mission.id, best: data.best, solo: data.solo, session, draft: data.draft, hintLevel: data.hintLevel,
      review: history.length > 0 && (data.review || session.status !== "playing"), mode: data.mode === "desk" ? "desk" : data.mode === "story" ? "story" : "desk",
      guide: readGuide(data.guide, mission.id, history.length > 0 || data.mode === undefined),
      ...(fallback.chapters ? { chapters: fallback.chapters } : {}) };
  } catch {
    return fallback;
  }
}
export function writeSave(key: string, save: Save, storage?: Pick<Storage, "setItem">): boolean {
  try { (storage ?? localStorage).setItem(key, JSON.stringify(save)); return true; } catch { return false; }
}
export function recordScore(save: Save): void {
  const score = stars(save.session, MISSIONS[save.activeId - 1]);
  if (!score) return;
  save.best[save.activeId] = Math.max(save.best[save.activeId] ?? 0, score);
  if (!save.session.hinted) save.solo[save.activeId] = Math.max(save.solo[save.activeId] ?? 0, score);
}
