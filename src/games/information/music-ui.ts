import { MUSIC_TRACKS, type AudioState } from "./audio.js";
import { icon } from "./ui.js";

export function musicButton(): string {
  return `<button class="music-button" data-action="music" data-music-button aria-label="打开音乐设置" aria-haspopup="dialog">${icon("music")}<span data-music-label>开启音乐</span></button>`;
}

export function updateMusicUI(state: AudioState): void {
  const track = MUSIC_TRACKS.find(({ id }) => id === state.trackId)!;
  document.querySelectorAll<HTMLElement>("[data-music-button]").forEach((button) => {
    button.classList.toggle("enabled", state.enabled);
    button.setAttribute("aria-label", state.enabled ? "打开音乐设置" : "开启音乐并打开音乐设置");
    button.title = state.enabled ? `音乐：${track.title}` : "开启原创背景音乐";
  });
  document.querySelectorAll("[data-music-label]").forEach((label) => { label.textContent = state.enabled ? "音乐" : "开启音乐"; });
  const toggle = document.querySelector("[data-action='music-toggle']");
  if (toggle) {
    toggle.setAttribute("aria-pressed", String(state.enabled));
    toggle.classList.toggle("chosen", state.enabled);
    toggle.textContent = state.enabled ? "关闭音乐" : "开启音乐";
  }
  document.querySelectorAll<HTMLElement>("[data-action='music-track']").forEach((button) => {
    const selected = button.dataset.track === state.track;
    button.classList.toggle("chosen", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  const labels = {
    "#music-volume-label": `${Math.round(state.volume * 100)}%`,
    "#music-now-title": track.title,
    "#music-status": state.error || (state.loading ? "正在加载配乐…"
      : !state.enabled ? "音乐已关闭。" : state.hidden ? "暂离值班席，音乐已暂停。"
      : state.waiting ? "下次点击时，音乐会继续。" : state.volume === 0 ? "音量为 0，调高就能听见。"
      : state.playing ? (state.track === "auto" ? "随剧情自动选曲 · 循环播放" : "固定曲目 · 循环播放") : "等待播放…"),
  };
  for (const [selector, text] of Object.entries(labels)) {
    const element = document.querySelector(selector);
    if (element) element.textContent = text;
  }
}

export function renderMusicSettings(state: AudioState): string {
  return `
    <p class="modal-intro">四首值班配乐，可以随剧情播放，也可以选一首循环听。</p>
    <div class="music-now"><span class="music-disc">${icon("music")}</span><div><small>当前旋律</small><strong id="music-now-title"></strong><p id="music-status" role="status" aria-live="polite"></p></div><button class="secondary-button" data-action="music-toggle" aria-pressed="${state.enabled}">开启音乐</button></div>
    <label class="music-volume" for="music-volume"><span>音乐音量</span><input id="music-volume" type="range" min="0" max="100" step="1" value="${Math.round(state.volume * 100)}"><output id="music-volume-label" for="music-volume">${Math.round(state.volume * 100)}%</output></label>
    <button class="music-auto" data-action="music-track" data-track="auto" aria-pressed="${state.track === "auto"}"><span>${icon("spark")}随剧情自动选曲</span><small>开场、任务和结算使用不同配乐，打开工具时继续播放。</small><span class="radio-dot"></span></button>
    <div class="music-track-list" aria-label="固定播放一首配乐">${MUSIC_TRACKS.map((track, index) => `<button class="music-track" data-action="music-track" data-track="${track.id}" aria-pressed="${state.track === track.id}"><span class="music-track-number mono">0${index + 1}</span><span><strong>${track.title}<small>${track.scene}</small></strong><p>${track.description}</p></span><span class="radio-dot"></span></button>`).join("")}</div>
    <p class="microcopy music-footnote">原创电子氛围配乐 · 音乐偏好会自动记住 · 离开页面时自动暂停</p>
    <div class="modal-actions"><button class="primary-button" data-action="close">回到值班席 ${icon("arrow")}</button></div>`;
}
