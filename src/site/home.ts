import { GAMES } from "./catalog.js";
import { escapeHtml } from "../shared/html.js";

const catalog = document.querySelector<HTMLElement>("#game-catalog");
if (!catalog) throw new Error("Missing game catalog");
catalog.innerHTML = GAMES.map((game, index) => `
  <article class="game-card">
    <a class="game-art" href="${escapeHtml(game.href)}" aria-label="进入${escapeHtml(game.title)}">
      <span class="art-label">${escapeHtml(game.subject)} / KNOWLEDGE GAME <span>${game.chapters} CHAPTERS</span></span>
      <div class="signal-orbit" aria-hidden="true"><span class="signal-planet"></span><span class="signal-station">⌁</span><span class="signal-ship">↗</span><span class="signal-bit bit-one">010</span><span class="signal-bit bit-two">110</span></div>
      <span class="art-caption">${escapeHtml(game.title)}<span>EXPLORE THROUGH PLAY</span></span>
    </a>
    <div class="game-copy">
      <div class="game-meta"><span>GAME ${String(index + 1).padStart(2, "0")} / ${escapeHtml(game.subject)}</span><span class="available">已上线</span></div>
      <h3><a href="${escapeHtml(game.href)}">${escapeHtml(game.title)}</a></h3>
      <p>${escapeHtml(game.description)}</p>
      <ul class="game-tags" aria-label="涉及知识">${game.tags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join("")}</ul>
      <div class="game-bottom"><span>${game.chapters} 个航段 · 剧情引导与独立挑战</span><a class="play-link" href="${escapeHtml(game.href)}">进入游戏 <span aria-hidden="true">↗</span></a></div>
    </div>
  </article>`).join("");
const count = document.querySelector("#game-count");
if (count) count.textContent = `${String(GAMES.length).padStart(2, "0")} 款游戏`;

// Keep isolated browser test profiles when moving between the directory and a game.
if (new URLSearchParams(location.search).has("test")) {
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href*="games/"]')) {
    const url = new URL(link.href);
    url.searchParams.set("test", "1");
    link.href = url.href;
  }
}
