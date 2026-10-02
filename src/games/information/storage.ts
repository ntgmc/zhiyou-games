import { SYMBOLS, createSession, sameCodes, FIXED_CODES, transmitRound, waitRound } from "./engine.js";
import { MISSIONS } from "./missions.js";
import { prepareStory } from "./story.js";
import type { Progress, Session } from "./types.js";
import { readChapters, type ChapterDrafts } from "../../shared/chapter-drafts.js";

export interface Save { version: number; progress: Progress; activeId: number; session?: Session | null; chapters?: ChapterDrafts }

function scores(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id, score]) =>
    MISSIONS.some((mission) => String(mission.id) === id) && Number.isInteger(score) && Number(score) >= 1 && Number(score) <= 3));
}

export function readSave(storageKey: string, storage?: Pick<Storage, "getItem">): Save {
  const fallback: Save = { version: 1, progress: { unlocked: 1, best: {}, soloBest: {}, lessons: [] }, activeId: 1 };
  try {
    const value: Save | null = JSON.parse((storage || localStorage).getItem(storageKey) || "null");
    if (!value || value.version !== 1 || !Number.isInteger(value.progress?.unlocked)) return fallback;
    value.progress.unlocked = Math.max(1, Math.min(MISSIONS.length, value.progress.unlocked));
    if (!value.progress.best || typeof value.progress.best !== "object") return fallback;
    value.progress.best = scores(value.progress.best);
    for (const item of MISSIONS) if (Number(value.progress.best[item.id]) > 0) {
      value.progress.unlocked = Math.max(value.progress.unlocked, Math.min(MISSIONS.length, item.id + 1));
    }
    value.progress.lessons = Array.isArray(value.progress.lessons) ? value.progress.lessons.filter((lesson) => typeof lesson === "string") : [];
    value.progress.soloBest = scores(value.progress.soloBest);
    for (const id of Object.keys(value.progress.soloBest)) if (value.progress.soloBest[id] > (value.progress.best[id] ?? 0)) delete value.progress.soloBest[id];
    if (!Number.isInteger(value.activeId) || value.activeId < 1 || value.activeId > value.progress.unlocked) value.activeId = 1;
    const chapters = readChapters(value.chapters, MISSIONS.length);
    if (chapters) value.chapters = chapters; else delete value.chapters;
    const savedMission = MISSIONS.find((item) => item.id === value.activeId);
    const candidate = value.session;
    if (!candidate || !savedMission || candidate.missionId !== savedMission.id ||
        !Array.isArray(candidate.history) || candidate.history.length > savedMission.rounds || !Array.isArray(candidate.selectedIds) ||
        new Set(candidate.selectedIds).size !== candidate.selectedIds.length ||
        candidate.selectedIds.some((id) => !savedMission.packets.some((packet) => packet.id === id)) ||
        !candidate.taskStates || !candidate.receiverCodes || !candidate.customCodes ||
        !["fixed", "custom"].includes(candidate.coding) ||
        !SYMBOLS.every(({ id }) => typeof candidate.customCodes[id] === "string" && candidate.customCodes[id].length <= 10 && typeof candidate.receiverCodes[id] === "string") ||
        !savedMission.packets.every((packet) => ["pending", "delivered", "failed", "expired"].includes(candidate.taskStates[packet.id])) ||
        !["playing", "won", "lost"].includes(candidate.status) ||
        !Number.isFinite(candidate.totalBits) || candidate.totalBits < 0 ||
        !Number.isInteger(candidate.round) || candidate.round < 1 || candidate.round > savedMission.rounds ||
        !savedMission.protections.includes(candidate.protection)) value.session = null;
    else {
      try {
        let session = createSession(savedMission);
        for (const turn of candidate.history) {
          if (!turn || turn.round !== session.round || typeof turn.skipped !== "boolean" ||
              !savedMission.protections.includes(turn.protection) || !Array.isArray(turn.packets)) throw new Error("Invalid history");
          session.protection = turn.protection;
          if (turn.skipped) session = waitRound(session, savedMission).next;
          else {
            if (!turn.codes || !SYMBOLS.every(({ id }) => typeof turn.codes[id] === "string" && turn.codes[id].length <= 10)) throw new Error("Invalid codebook");
            session.coding = turn.coding ?? (sameCodes(turn.codes, FIXED_CODES) ? "fixed" : "custom");
            if (!["fixed", "custom"].includes(session.coding)) throw new Error("Invalid coding");
            session.customCodes = { ...turn.codes };
            session.selectedIds = turn.packets.map((packet) => packet.id);
            session = transmitRound(session, savedMission).next;
          }
        }
        session.coding = candidate.coding;
        session.customCodes = Object.fromEntries(SYMBOLS.map(({ id }) => [id, candidate.customCodes[id]]));
        session.protection = candidate.protection;
        session.selectedIds = [...candidate.selectedIds];
        if (candidate.guide) {
          session.guide = structuredClone(candidate.guide);
          session.hintLevel = candidate.hintLevel;
          prepareStory(session, savedMission);
        }
        value.session = session;
      } catch { value.session = null; }
    }
    return value;
  } catch {
    return fallback;
  }
}

export function writeSave(storageKey: string, value: Save, storage?: Pick<Storage, "setItem">): boolean {
  try { (storage || localStorage).setItem(storageKey, JSON.stringify(value)); return true; } catch { return false; }
}
