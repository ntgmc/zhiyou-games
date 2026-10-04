import { GameAudio, type AudioState, type MusicTrack } from "./audio.js";
import { escapeHtml as h } from "./html.js";

export const GAME_MUSIC = {
  "game-theory": { id: "harbor", title: "港口午后", file: "harbor.mp3" },
  probability: { id: "workbench", title: "台灯下", file: "workbench.mp3" },
  network: { id: "mountain", title: "沿山而行", file: "mountain.mp3" },
} satisfies Record<string, MusicTrack>;

export function installMusic(root: HTMLElement, storageKey: string, track: MusicTrack) {
  let opened = false;
  function status(state: AudioState): string {
    return state.error || (state.loading ? "正在加载配乐…" : !state.enabled ? "音乐已关闭。"
      : state.hidden ? "页面已暂离，音乐暂停。" : state.waiting ? "点击页面后继续播放。"
      : state.volume === 0 ? "音量为 0，调高就能听见。" : state.playing ? "循环播放" : "等待播放…");
  }
  function refresh(state = audio.state): void {
    const button = root.querySelector<HTMLButtonElement>("[data-music-toggle]");
    if (button) {
      button.textContent = state.error ? "重试播放" : state.enabled ? "关闭音乐" : "开启音乐";
      button.setAttribute("aria-pressed", String(state.enabled));
    }
    const output = root.querySelector("#background-music-volume-label");
    if (output) output.textContent = `${Math.round(state.volume * 100)}%`;
    const message = root.querySelector("[data-music-status]");
    if (message) message.textContent = status(state);
    const summary = root.querySelector("[data-music-summary]");
    if (summary) summary.textContent = state.enabled ? "音乐 · 已开启" : "音乐 · 已关闭";
  }
  const audio = new GameAudio({ storageKey: `${storageKey}:audio`, tracks: [track], onChange: refresh });
  // Capture toggle because it does not bubble; the games rebuild their headers.
  root.addEventListener("toggle", (event) => {
    if (event.target instanceof HTMLDetailsElement && event.target.id === "background-music") opened = event.target.open;
  }, true);
  root.addEventListener("click", (event) => {
    if ((event.target as Element).closest("[data-music-toggle]")) audio.setEnabled(!!audio.error || !audio.settings.enabled);
  });
  root.addEventListener("input", (event) => {
    if (event.target instanceof HTMLInputElement && event.target.id === "background-music-volume") audio.setVolume(Number(event.target.value) / 100);
  });
  function resume(): void {
    if (audio.settings.enabled && (!audio.unlocked || audio.context?.state === "suspended")) audio.unlock();
  }
  document.addEventListener("pointerdown", resume, { passive: true });
  document.addEventListener("keydown", resume);
  document.addEventListener("visibilitychange", () => audio.setHidden(document.hidden));
  window.addEventListener("pagehide", () => audio.setHidden(true));
  window.addEventListener("pageshow", () => audio.setHidden(document.hidden));
  return {
    render(): string {
      const state = audio.state;
      return `<details class="background-music" id="background-music" ${opened ? "open" : ""}>
        <summary data-music-summary>${state.enabled ? "音乐 · 已开启" : "音乐 · 已关闭"}</summary>
        <div class="background-music-panel"><strong>${h(track.title)}</strong>
          <button type="button" data-music-toggle aria-pressed="${state.enabled}">${state.error ? "重试播放" : state.enabled ? "关闭音乐" : "开启音乐"}</button>
          <label for="background-music-volume">音乐音量</label>
          <div class="background-music-volume"><input id="background-music-volume" type="range" min="0" max="100" step="1" value="${Math.round(state.volume * 100)}"><output id="background-music-volume-label" for="background-music-volume">${Math.round(state.volume * 100)}%</output></div>
          <p data-music-status role="status" aria-live="polite">${h(status(state))}</p>
        </div></details>`;
    },
  };
}
