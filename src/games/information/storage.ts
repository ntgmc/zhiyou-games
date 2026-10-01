import { SYMBOLS } from "./engine.js";
import { MISSIONS } from "./missions.js";
import type { Progress, Session } from "./types.js";

export interface Save { version: number; progress: Progress; activeId: number; session?: Session | null }

export function readSave(storageKey: string, storage?: Pick<Storage, "getItem">): Save {
  const fallback: Save = { version: 1, progress: { unlocked: 1, best: {}, soloBest: {}, lessons: [] }, activeId: 1 };
  try {
    const value: Save | null = JSON.parse((storage || localStorage).getItem(storageKey) || "null");
    if (!value || value.version !== 1 || !Number.isInteger(value.progress?.unlocked)) return fallback;
    value.progress.unlocked = Math.max(1, Math.min(MISSIONS.length, value.progress.unlocked));
    if (!value.progress.best || typeof value.progress.best !== "object") return fallback;
    for (const item of MISSIONS) if (Number(value.progress.best[item.id]) > 0) {
      value.progress.unlocked = Math.max(value.progress.unlocked, Math.min(MISSIONS.length, item.id + 1));
    }
    if (!Array.isArray(value.progress.lessons)) value.progress.lessons = [];
    if (!value.progress.soloBest || typeof value.progress.soloBest !== "object") value.progress.soloBest = {};
    if (value.activeId > value.progress.unlocked) value.activeId = 1;
    const savedMission = MISSIONS.find((item) => item.id === value.activeId);
    const candidate = value.session;
    if (!candidate || !savedMission || candidate.missionId !== savedMission.id ||
        !Array.isArray(candidate.history) || !Array.isArray(candidate.selectedIds) ||
        !candidate.taskStates || !candidate.receiverCodes || !candidate.customCodes ||
        !["fixed", "custom"].includes(candidate.coding) ||
        !SYMBOLS.every(({ id }) => typeof candidate.customCodes[id] === "string" && typeof candidate.receiverCodes[id] === "string") ||
        !savedMission.packets.every((packet) => ["pending", "delivered", "failed", "expired"].includes(candidate.taskStates[packet.id])) ||
        !["playing", "won", "lost"].includes(candidate.status) ||
        !Number.isFinite(candidate.totalBits) || candidate.totalBits < 0 ||
        !Number.isInteger(candidate.round) || candidate.round < 1 || candidate.round > savedMission.rounds ||
        !savedMission.protections.includes(candidate.protection)) value.session = null;
    return value;
  } catch {
    return fallback;
  }
}

export function writeSave(storageKey: string, value: Save, storage?: Pick<Storage, "setItem">): void {
  try { (storage || localStorage).setItem(storageKey, JSON.stringify(value)); } catch { /* Storage failures do not block play. */ }
}
