export type ChapterDrafts = Record<string, unknown>;
interface ChapterSave { activeId: number; chapters?: ChapterDrafts }
type Reader<T> = (key: string, storage: Pick<Storage, "getItem">) => T;

export function readChapters(value: unknown, count: number): ChapterDrafts | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value).filter(([id, draft]) => {
    const item = draft as { version?: number; activeId?: number } | null;
    return /^[1-9]\d*$/.test(id) && Number(id) <= count && item?.version === 1 && item.activeId === Number(id);
  }).map(([id, draft]) => {
    const { chapters: _, ...snapshot } = draft as Record<string, unknown>;
    return [id, snapshot];
  });
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function archiveChapter<T extends ChapterSave>(save: T): ChapterDrafts {
  const { chapters, ...snapshot } = save;
  return { ...chapters, [save.activeId]: structuredClone(snapshot) };
}

export function resumeChapter<T extends ChapterSave>(save: T, id: number, read: Reader<T>, progress: Partial<T>): T | null {
  const draft = save.chapters?.[id];
  if (!draft || typeof draft !== "object") return null;
  const restored = read("chapter", { getItem: () => JSON.stringify({ ...draft, ...progress }) });
  if (restored.activeId !== id) return null;
  restored.chapters = save.chapters;
  return restored;
}
