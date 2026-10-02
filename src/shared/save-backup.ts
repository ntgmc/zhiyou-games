import { archiveChapter, type ChapterDrafts } from "./chapter-drafts.js";

interface BackupSave {
  version: number;
  activeId: number;
  chapters?: ChapterDrafts;
  best?: Record<string, number>;
  solo?: Record<string, number>;
  unlocked?: number;
  progress?: { best: Record<string, number>; soloBest: Record<string, number>; unlocked: number; lessons: string[]; consoleMode?: boolean };
}
type Reader<T> = (key: string, storage: Pick<Storage, "getItem">) => T;
const MAX_BACKUP_SIZE = 5 * 1024 * 1024;

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}
function checked<T extends BackupSave>(value: unknown, read: Reader<T>): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("存档格式不完整，当前进度未改变。");
  const { chapters, ...snapshot } = value as T;
  if ("session" in snapshot && !snapshot.session) throw new Error("存档缺少当前任务，当前进度未改变。");
  const restored = read("backup", { getItem: () => JSON.stringify(snapshot) });
  if (canonical(restored) !== canonical(snapshot)) throw new Error("存档含有无法恢复的数据，当前进度未改变。");
  if (chapters !== undefined) {
    if (!chapters || typeof chapters !== "object" || Array.isArray(chapters)) throw new Error("章节草稿格式不正确。");
    for (const [id, draft] of Object.entries(chapters)) {
      if (!draft || typeof draft !== "object" || "chapters" in draft) throw new Error("章节草稿格式不正确。");
      const chapter = checked(draft, read);
      if (String(chapter.activeId) !== id || chapter.chapters) throw new Error("章节草稿与章节编号不符。");
    }
    restored.chapters = chapters;
  }
  return restored;
}
export function exportBackup<T extends BackupSave>(game: string, save: T, read: Reader<T>): string {
  return JSON.stringify({ format: "zhiyou-save", version: 1, game, save: checked(save, read) }, null, 2);
}
export function importBackup<T extends BackupSave>(text: string, game: string, read: Reader<T>): T {
  if (text.length > MAX_BACKUP_SIZE) throw new Error("备份超过 5 MB，无法导入。");
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("文件不是有效的存档备份，当前进度未改变。"); }
  if (data?.format !== "zhiyou-save" || data.version !== 1 || data.game !== game) throw new Error("请选择这款游戏导出的备份，当前进度未改变。");
  return checked(data.save, read);
}
function betterScores(a: Record<string, number> = {}, b: Record<string, number> = {}): Record<string, number> {
  return Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map((id) => [id, Math.max(a[id] ?? 0, b[id] ?? 0)]));
}
export function mergeBackup<T extends BackupSave>(current: T, imported: T): T {
  const next = structuredClone(imported);
  next.chapters = { ...archiveChapter(current), ...imported.chapters };
  delete next.chapters[next.activeId];
  if (next.progress && current.progress) {
    next.progress.best = betterScores(current.progress.best, next.progress.best);
    next.progress.soloBest = betterScores(current.progress.soloBest, next.progress.soloBest);
    next.progress.unlocked = Math.max(current.progress.unlocked, next.progress.unlocked);
    next.progress.lessons = [...new Set([...current.progress.lessons, ...next.progress.lessons])];
  } else {
    next.best = betterScores(current.best, next.best);
    next.solo = betterScores(current.solo, next.solo);
    if (next.unlocked !== undefined) next.unlocked = Math.max(current.unlocked ?? 1, next.unlocked);
  }
  return next;
}

export function backupControls(): string {
  return `<details class="save-backup"><summary>备份与恢复进度</summary>
    <p>导出文件可留作备份，也可在另一台设备导入。导入前会显示确认信息；已有成绩取较好的记录。</p>
    <button type="button" data-backup="export">导出存档</button>
    <label>选择存档备份<input type="file" data-backup-file accept=".json,application/json"></label>
    <p data-backup-message role="status"></p><button type="button" data-backup="import" hidden>导入并保留已有成绩</button></details>`;
}
export function installBackup<T extends BackupSave>(
  root: HTMLElement, game: string, read: Reader<T>, getSave: () => T, apply: (save: T) => void, announce: (text: string) => void,
): void {
  let pending: T | null = null;
  let selection = 0;
  root.addEventListener("change", async (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.hasAttribute("data-backup-file")) return;
    const panel = input.closest<HTMLElement>(".save-backup")!;
    const message = panel.querySelector<HTMLElement>("[data-backup-message]")!;
    const button = panel.querySelector<HTMLButtonElement>('[data-backup="import"]')!;
    const token = ++selection;
    pending = null;
    button.hidden = true;
    const file = input.files?.[0];
    if (!file) { message.textContent = ""; return; }
    try {
      if (file.size > MAX_BACKUP_SIZE) throw new Error("备份超过 5 MB，无法导入。");
      const imported = importBackup(await file.text(), game, read);
      if (token !== selection || !input.isConnected) return;
      pending = imported;
      message.textContent = `备份停在第 ${imported.activeId} 章。导入会替换备份中各章的当前尝试，保留本机其他章节草稿，已有成绩取较好记录。`;
      button.hidden = false;
    } catch (error) {
      if (token === selection && input.isConnected) message.textContent = error instanceof Error ? error.message : "无法读取这份备份。";
    }
  });
  root.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLElement>("[data-backup]");
    if (!button) return;
    try {
      if (button.dataset.backup === "export") {
        const text = exportBackup(game, getSave(), read);
        const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `${game}-save-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        announce("存档备份已生成，请保留下载的文件。");
      } else if (pending && !button.hidden) {
        const next = mergeBackup(getSave(), pending);
        pending = null;
        apply(next);
        announce("备份已导入，已有成绩已合并。");
      }
    } catch (error) { announce(error instanceof Error ? error.message : "存档操作未完成。"); }
  });
}
