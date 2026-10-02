import { GAMES } from "./catalog.js";
import { escapeHtml } from "../shared/html.js";

interface ReleaseInfo {
  siteVersion: string;
  contentVersion: string;
  builtAt: string;
  games: Record<string, string>;
}

const root = document.querySelector<HTMLElement>("#page-content");
if (!root) throw new Error("Missing page content");
const metadata = document.querySelector<HTMLMetaElement>('meta[name="release-info"]')?.content;
const release: ReleaseInfo | null = metadata ? JSON.parse(metadata) : null;
const chapterCount = (game: typeof GAMES[number]) => `${game.chapters} ${game.chapterLabel ?? "个航段"}`;
const gameHref = (game: typeof GAMES[number]) => `../${game.href.slice(2)}`;
const version = (id: string) => escapeHtml(release?.games[id] ?? "开发预览");

if (document.body.dataset.page === "status") {
  root.innerHTML = `
    <section class="info-summary" aria-label="开放概况">
      <div><span>已开放游戏</span><strong>${GAMES.length} 款</strong></div>
      <div><span>全部章节与航段</span><strong>${GAMES.reduce((sum, game) => sum + game.chapters, 0)} 个</strong></div>
    </section>
    <section aria-labelledby="status-title"><div class="section-heading"><h2 id="status-title">游戏开放情况</h2><a class="quiet-link" href="../versions/">查看全部版本 ↗</a></div>
      <div class="status-list">${GAMES.map((game) => `
        <article class="status-card" aria-labelledby="title-${escapeHtml(game.id)}">
          <div class="game-meta"><span>${escapeHtml(game.subject)}</span><span class="available">已开放</span></div>
          <h3 id="title-${escapeHtml(game.id)}"><a href="${escapeHtml(gameHref(game))}">${escapeHtml(game.title)}</a></h3>
          <p>${escapeHtml(chapterCount(game))} · 剧情引导与独立挑战</p>
          <ul class="game-tags" aria-label="涉及知识">${game.tags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join("")}</ul>
          <div class="game-bottom"><a class="quiet-link" href="../versions/#${escapeHtml(game.id)}">内容版本 <code>${version(game.id)}</code></a><a class="play-link" href="${escapeHtml(gameHref(game))}">进入游戏 ↗</a></div>
        </article>`).join("")}
      </div>
    </section>`;
} else {
  const builtAt = release
    ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Shanghai" }).format(new Date(release.builtAt))
    : "发布构建后生成";
  root.innerHTML = `
    <section aria-labelledby="release-title"><h2 id="release-title">当前站点</h2>
      <dl class="release-facts">
        <div><dt>站点版本</dt><dd>${escapeHtml(release?.siteVersion ?? "开发预览")}</dd></div>
        <div><dt>整站内容版本</dt><dd><code>${escapeHtml(release?.contentVersion ?? "开发预览")}</code></dd></div>
        <div><dt>构建时间（北京时间）</dt><dd>${release ? `<time datetime="${escapeHtml(release.builtAt)}">${escapeHtml(builtAt)}</time>` : builtAt}</dd></div>
      </dl>
    </section>
    <section aria-labelledby="versions-title"><div class="section-heading"><h2 id="versions-title">各游戏版本</h2><a class="quiet-link" href="../status/">查看开放情况 ↗</a></div>
      <div class="version-table-wrap" role="region" aria-label="各游戏版本，可横向滚动" tabindex="0">
        <table class="version-table"><caption class="visually-hidden">各游戏的内容版本与开放章节</caption>
          <thead><tr><th scope="col">游戏</th><th scope="col">内容版本</th><th scope="col">已开放内容</th><th scope="col">入口</th></tr></thead>
          <tbody>${GAMES.map((game) => `<tr id="${escapeHtml(game.id)}"><th scope="row">${escapeHtml(game.title)}<small>${escapeHtml(game.subject)}</small></th><td><code>${version(game.id)}</code></td><td>${escapeHtml(chapterCount(game))}</td><td><a class="play-link" href="${escapeHtml(gameHref(game))}" aria-label="进入${escapeHtml(game.title)}">进入游戏 ↗</a></td></tr>`).join("")}</tbody>
        </table>
      </div>
    </section>
    <details class="version-help"><summary>这些版本号是什么意思？</summary>
      <p>站点版本是项目维护的发布编号。内容版本是根据文件内容生成的标识，用来区分不同的发布内容；它没有大小或先后顺序。</p>
      <p>游戏的页面、代码、样式、目录信息和共用资源变化时，内容版本会更新。共用资源变化也可能更新多个游戏的版本。同样的内容再次构建，内容版本保持一致。</p>
      <p>构建时间是当前发布包生成的时间。游戏内容版本与存档格式版本分别维护；进度仍按各游戏的存档规则保存。</p>
    </details>`;
}

// Keep the isolated test profile through site navigation and game links.
if (new URLSearchParams(location.search).has("test")) {
  for (const link of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    if (link.getAttribute("href")?.startsWith("#")) continue;
    const url = new URL(link.href);
    if (url.origin !== location.origin) continue;
    url.searchParams.set("test", "1");
    link.href = url.href;
  }
}
