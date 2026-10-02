import {
  SYMBOLS, FIXED_CODES, PROTECTIONS, countSymbols, entropy, averageLength,
  validateCodebook, makeHuffman, treeToCodes,
  createSession, sessionCodes, selectedCounts, planRound, transmitRound, waitRound, encodeSource, protectBits, roundConditions, packetAvailable,
} from "./engine.js";
import { MISSIONS, LESSONS } from "./missions.js";
import { STORY, prepareStory, storyStep, advanceStory, storyCanSend } from "./story.js";
import { GameAudio } from "./audio.js";
import { musicButton, renderMusicSettings, updateMusicUI as refreshMusicUI } from "./music-ui.js";
import { createTree, mergeTree, renderTree, type TreeState } from "./tree.js";
import { renderLab, type LabState } from "./lab.js";
import { readSave, writeSave } from "./storage.js";
import { icon, stars, modalFrame as frame } from "./ui.js";
import { storyResult, detailedResult } from "./results.js";
import { escapeHtml } from "../../shared/html.js";
import type { Chapter, Coding, Packet, Protection, RoundResult, StoryStep } from "./types.js";

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const STORAGE_KEY = new URLSearchParams(location.search).has("test") ? "deep-space-comms-test-v1" : "deep-space-comms-save-v1";
const app = $("#app");
const modalRoot = $("#modal-root");
if (!app || !modalRoot) throw new Error("Missing game roots");
const siteHome = new URL("../../", location.href);
if (new URLSearchParams(location.search).has("test")) siteHome.searchParams.set("test", "1");
const saved = readSave(STORAGE_KEY);
const progress = saved.progress;
const chapterRanges: [number, number, string][] = [[1, 5, "学习基础 · 1～5"], [6, 8, "独立考核 · 6～8"], [9, 12, "进阶航段 · 9～12"], [13, 18, "返航值班 · 13～18"], [19, MISSIONS.length, `综合值班 · 19～${MISSIONS.length}`]];
const campaignEntries = [9, 13, 19];
let mission = MISSIONS.find((item) => item.id === saved.activeId) || MISSIONS[0];
let session = prepareStory(saved.session?.missionId === mission.id ? saved.session : createSession(mission), mission);
let consoleMode = progress.consoleMode === true;
let busy = false;
type Modal = { type: string; phase?: number; lesson?: string; result?: RoundResult; historical?: boolean; detailed?: boolean };
let modal: Modal | null = null;
let treeState: TreeState = { forest: [], selected: [], undo: [], next: 4, feedback: "" };
let labState: LabState = { data: "1011", flipped: [], corrected: false };
let tuningOpen = false;
let futureForecastOpen = false;
let queueOverviewOpen = false;
let lastFocus: HTMLElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
const music = new GameAudio({
  storageKey: `${STORAGE_KEY}:audio`,
  onChange: updateMusicUI,
  onError: (message) => toast(message),
});

function save() {
  writeSave(STORAGE_KEY, { version: 1, progress, activeId: mission.id, session });
}

function completedCount() {
  return Object.keys(progress.best).filter((id) => progress.best[id] > 0).length;
}

function toast(message: string) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 3600);
}

function render() {
  if (consoleMode) renderConsole();
  else renderStory();
  syncMusicScene();
  updateMusicUI();
}

function syncMusicScene() {
  music.setScene({
    missionId: mission.id,
    intro: session.guide.intro < STORY[mission.id].scenes.length,
    status: session.status,
  });
}

function updateMusicUI(state = music.state) {
  refreshMusicUI(state);
}

function renderConsole() {
  const completed = completedCount();
  const conditions = roundConditions(mission, session.round);
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <a class="brand" href="${escapeHtml(siteHome.href)}" aria-label="返回知游游戏目录">
          <span class="brand-mark">${icon("dish")}</span>
          <span><strong>深空通信站</strong><small>DEEP SPACE COMMS</small></span>
        </a>
        <div class="station-status"><span class="status-dot"></span> 弥拉通信网络 <span class="mono">ONLINE</span></div>
        <nav class="primary-nav" aria-label="主导航">
          <button class="nav-item active" data-action="home">${icon("grid")}任务控制台<span class="nav-count">${MISSIONS.length}</span></button>
          <button class="nav-item" data-action="academy">${icon("book")}通信手册<span class="nav-external">↗</span></button>
          <button class="nav-item" data-action="lab">${icon("shield")}纠错实验台<span class="nav-external">↗</span></button>
        </nav>
        <div class="sidebar-section-heading">通信员航段计划 <span>${String(completed).padStart(2, "0")} / ${MISSIONS.length}</span></div>
        <nav class="mission-nav" aria-label="关卡选择">
          ${MISSIONS.map((item) => {
            const unlocked = item.id <= progress.unlocked || campaignEntries.includes(item.id);
            const won = progress.best[item.id] > 0;
            return `<button class="mission-nav-item ${item.id === mission.id ? "selected" : ""} ${won ? "completed" : ""}" data-action="mission" data-id="${item.id}" ${unlocked ? "" : "disabled"} aria-label="第 ${item.id} 章 ${item.chapter}" aria-current="${item.id === mission.id ? "step" : "false"}">
              <span class="mission-index">${won ? icon("check") : unlocked ? String(item.id).padStart(2, "0") : icon("lock")}</span>
              <span class="mission-nav-copy"><strong>${item.chapter}</strong><small>${item.concept}</small></span>
              ${item.id === mission.id ? '<span class="current-mark"></span>' : won ? stars(progress.best[item.id]) : ""}
            </button>`;
          }).join("")}
        </nav>
        <div class="sidebar-bottom">
          <div class="training-progress"><span>训练进度</span><strong>${Math.round(completed / MISSIONS.length * 100)}%</strong></div>
          <div class="progress-track"><i style="width:${completed / MISSIONS.length * 100}%"></i></div>
          <div class="operator"><span class="operator-avatar">C</span><span><strong>${completed === MISSIONS.length ? "深空通信官" : completed >= 4 ? "助理通信官" : "见习通信官"}</strong><small>本地档案 · 自动保存</small></span><span class="status-dot"></span></div>
        </div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div class="breadcrumb"><span>任务控制台</span>${icon("chevron")}<strong>航段 ${String(mission.id).padStart(2, "0")}</strong></div>
          <div class="topbar-right"><button class="text-button" data-action="story-mode">返回剧情引导</button>${musicButton()}<span class="local-badge"><span class="status-dot"></span>本地模拟</span><button class="icon-button" data-action="help" aria-label="玩法说明" title="玩法说明">${icon("info")}</button></div>
        </header>
        <div class="main-content">
          <section class="hero">
            <div class="hero-copy">
              <div class="eyebrow"><span class="tiny-dash"></span> MISSION ${String(mission.id).padStart(2, "0")} / ${mission.kicker}</div>
              <h1>${mission.title}</h1>
              <p>${mission.objective}</p>
              <div class="hero-tags"><span>${icon("target")}${mission.concept}</span><span>${icon("clock")}${mission.rounds === 1 ? "单轮任务" : `${mission.rounds} 轮值班`}</span><span>${icon("pulse")}${conditions.noise.label}</span></div>
            </div>
            <div class="hero-visual" aria-hidden="true">
              <div class="orbit orbit-one"></div><div class="orbit orbit-two"></div>
              <div class="planet"><span></span></div>
              <div class="satellite satellite-one">${icon("dish")}</div>
              <div class="satellite satellite-two">${icon("spark")}</div>
              <div class="signal-line"></div><span class="star-dot star-one"></span><span class="star-dot star-two"></span><span class="star-dot star-three"></span>
              <span class="planet-label">MIRA / SECTOR 04</span>
            </div>
          </section>
          <div class="briefing-strip">
            <span class="briefing-icon">${icon("dish")}</span>
            <p><strong>值班简报</strong>${mission.briefing}</p>
            <button class="text-button" data-action="lesson" data-lesson="${mission.lesson}">知识速览 ${icon("arrow")}</button>
          </div>
          ${mission.independent ? `<div class="console-planning">${renderPlanningBrief()}</div>` : ""}
          <div class="workspace">
            <section class="panel queue-panel">
              <div class="panel-heading"><h2>${icon("grid")}消息队列</h2><span class="subtle mono">${mission.packets.filter((packet) => session.taskStates[packet.id] === "pending").length} 待处理</span></div>
              <div class="queue-instruction">选择本轮要发送的消息</div>
              <div class="packet-list">${renderPackets()}</div>
              <div class="distribution">
                <div class="small-section-title">所选消息的频率 <button class="plain-icon" data-action="lesson" data-lesson="entropy" aria-label="了解信息熵">${icon("info")}</button></div>
                <div id="distribution-rows">${renderDistribution()}</div>
                <div class="entropy-readout"><div><span>信息熵 H(X)</span><strong id="entropy-value">${entropy(selectedCounts(session, mission)).toFixed(3)} <small>bit / 指令</small></strong></div><span class="entropy-symbol">H</span></div>
                <p class="microcopy">频率来自所选消息。没有选择时，显示待发队列。熵衡量平均不确定性。</p>
              </div>
            </section>
            <section class="panel workbench-panel">
              <div class="panel-heading"><h2>${icon("tree")}编码工作台</h2><span class="workbench-label">SOURCE → CHANNEL</span></div>
              <div class="workbench-body">
                <div class="step-title"><span class="step-number">01</span><h3>信源编码</h3><button class="plain-icon" data-action="lesson" data-lesson="prefix" aria-label="了解前缀码">${icon("info")}</button></div>
                <div class="segmented" role="group" aria-label="信源编码方式">
                  <button class="${session.coding === "fixed" ? "chosen" : ""}" data-action="coding" data-coding="fixed" aria-pressed="${session.coding === "fixed"}" ${busy || session.status !== "playing" ? "disabled" : ""}>定长编码 <span>2 bit / 指令</span></button>
                  <button class="${session.coding === "custom" ? "chosen" : ""}" data-action="coding" data-coding="custom" aria-pressed="${session.coding === "custom"}" ${busy || session.status !== "playing" || mission.id === 1 ? "disabled" : ""}>变长前缀码 <span>${mission.id === 1 ? "下一关解锁" : "按频率优化"}</span></button>
                </div>
                <div class="codebook-table">
                  <div class="codebook-header"><span>指令</span><span>次数</span><span>码字</span><span>码长</span></div>
                  ${renderCodeRows()}
                </div>
                <div id="code-feedback">${renderCodeFeedback()}</div>
                <div class="code-tools">
                  <button class="secondary-button" data-action="tree" ${mission.id === 1 || session.status !== "playing" || busy ? "disabled" : ""}>${icon("tree")}构造码树</button>
                  <button class="text-button" data-action="auto" ${mission.id < 3 || session.status !== "playing" || busy ? "disabled" : ""}>${icon("spark")}${mission.id < 3 ? "第 3 关解锁自动编码" : "生成哈夫曼码"}</button>
                </div>
                ${mission.independent && mission.syncCost ? `<div class="receiver-codebook"><span>接收端正在使用</span><code>${SYMBOLS.map(({ id }) => `${id}=${session.receiverCodes[id]}`).join(" · ")}</code><button class="text-button" data-action="receiver-codes" ${session.status !== "playing" ? "disabled" : ""}>沿用接收端码本</button></div>` : ""}
                <div class="source-metrics"><div><span>平均码长 L</span><strong id="average-value">${averageLength(selectedCounts(session, mission), sessionCodes(session)).toFixed(3)} <small>bit / 指令</small></strong></div><div><span>编码后数据</span><strong id="source-value">${planRound(session, mission).costs.reduce((sum, item) => sum + item.sourceBits, 0)} <small>bit</small></strong></div></div>
                <div class="step-title protection-title"><span class="step-number">02</span><h3>信道保护</h3><button class="text-button small" data-action="lab">打开实验台 ${icon("arrow")}</button></div>
                <div class="protection-options">
                  ${Object.entries(PROTECTIONS).map(([key, value]) => {
                    const unlocked = mission.protections.includes(key as Protection);
                    return `<button class="protection-card ${session.protection === key ? "chosen" : ""}" data-action="protection" data-protection="${key}" aria-pressed="${session.protection === key}" ${!unlocked || session.status !== "playing" || busy ? "disabled" : ""}>
                      <span class="protection-card-top">${icon(key === "none" ? "arrow" : key === "repeat" ? "wave" : "shield")}${!unlocked ? icon("lock", "mini-icon") : '<span class="radio-dot"></span>'}</span>
                      <strong>${value.name}</strong><small>${key === "none" ? "原始长度" : key === "repeat" ? "每 1 位 → 3 位" : "每 4 位 → 7 位"}</small>
                    </button>`;
                  }).join("")}
                </div>
                <div class="protection-note" id="protection-note">${protectionNote()}</div>
                ${mission.independent ? renderCostBreakdown() : ""}
                <div class="transmission-preview"><div class="small-section-title">本轮比特预算 <span id="budget-label"></span></div><div id="budget-bar"></div><div class="budget-legend"><span><i class="legend-square mint"></i>数据与保护 <b id="payload-label"></b></span><span><i class="legend-square gold"></i>同步 <b id="sync-label"></b></span><span><i class="legend-square empty"></i>可用 <b id="remaining-label"></b></span></div></div>
                <div class="send-area"><button class="send-button" id="send-button" data-action="send">${icon("send")}<span>发送本轮信号</span><span class="send-key">↵</span></button><p id="send-note"></p></div>
              </div>
            </section>
            <aside class="right-column">
              <section class="panel channel-panel">
                <div class="panel-heading"><h2>${icon("pulse")}信道监测</h2><span class="round-badge">轮次 ${session.round} / ${mission.rounds}</span></div>
                <div class="channel-map">${renderMap()}</div>
                <div class="channel-condition"><span class="status-dot ${conditions.noise.strength ? "warning" : ""}"></span><strong>${conditions.noise.label}</strong><span class="noise-level">${["LOW", "MODERATE", "HIGH"][conditions.noise.strength]}</span></div>
                <p class="channel-detail">${conditions.noise.detail}</p>
                <div class="channel-stats"><div><span>本轮容量</span><strong>${conditions.budget}<small> bit</small></strong></div><div><span>信道保护</span><strong class="small-value" id="channel-protection">${PROTECTIONS[session.protection].short}</strong></div></div>
                ${mission.syncCost ? `<div class="sync-explainer">${icon("info")}码本变化会占用 ${mission.syncCost} bit 可靠控制帧，已包含在预算中。</div>` : ""}
              </section>
              <section class="panel log-panel">
                <div class="panel-heading"><h2>${icon("dish")}通信记录</h2><span class="subtle mono">LOG</span></div>
                <div id="live-log">${renderLog()}</div>
              </section>
              <div class="hint-card">
                <div class="hint-heading">${icon("spark")}通信官提示<button class="plain-icon" data-action="hint" aria-label="显示本关提示">${icon("expand")}</button></div>
                <p>${mission.id < 3 ? "从消息频率出发。短码字应留给更常见的指令。" : mission.id < 6 ? "纠错有成本，也有保证范围。先检查本关的干扰模型。" : "先确认截止时间，再计算完整的发送成本。"}</p>
                <button class="text-button small" data-action="hint">查看策略提示 ${icon("arrow")}</button>
              </div>
            </aside>
          </div>
          <footer class="workspace-footer"><span><span class="status-dot"></span>所有编码、干扰和解码均在本地计算</span><div><button class="text-button muted" data-action="restart">${icon("reset")}重新开始本关</button>${mission.rounds > 1 && session.status === "playing" ? '<button class="text-button muted" data-action="wait">跳过本轮 →</button>' : ""}</div></footer>
        </div>
      </main>
    </div>`;
  updateLive();
  if (session.status !== "playing") renderEndBanner();
}

function spaceScene() {
  return `<div class="story-space" aria-hidden="true">
    <svg viewBox="0 0 520 430" fill="none">
      <defs>
        <radialGradient id="story-halo"><stop stop-color="#8dded4" stop-opacity=".14"/><stop offset="1" stop-color="#70bcc6" stop-opacity="0"/></radialGradient>
        <radialGradient id="story-planet" cx=".3" cy=".2"><stop stop-color="#456d78"/><stop offset=".55" stop-color="#1b3748"/><stop offset="1" stop-color="#091823"/></radialGradient>
        <linearGradient id="story-trail" x1="110" y1="300" x2="415" y2="148" gradientUnits="userSpaceOnUse"><stop stop-color="#83e8c5" stop-opacity=".1"/><stop offset="1" stop-color="#83e8c5" stop-opacity=".8"/></linearGradient>
      </defs>
      <circle cx="258" cy="182" r="189" fill="url(#story-halo)"/>
      ${[[26, 70], [78, 42], [151, 24], [403, 55], [480, 89], [449, 304], [56, 365], [306, 387], [172, 329], [486, 209], [25, 226], [353, 79], [111, 121], [302, 35], [369, 348]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 4 === 0 ? 1.8 : 1}" fill="#b9d0db" opacity="${i % 3 === 0 ? ".7" : ".3"}"/>`).join("")}
      <ellipse cx="257" cy="189" rx="214" ry="132" stroke="#345965" stroke-opacity=".38" transform="rotate(-25 257 189)"/>
      <ellipse cx="257" cy="189" rx="185" ry="108" stroke="#416f77" stroke-opacity=".3" stroke-dasharray="3 8" transform="rotate(-25 257 189)"/>
      <circle cx="258" cy="181" r="82" fill="url(#story-planet)" stroke="#47707a" stroke-opacity=".55"/>
      <path d="M184 149c27 7 91-25 134-20M177 168c44 18 127-38 158-7M184 215c24-27 67-2 111-32M208 250c34-12 77-13 115-37" stroke="#74a49c" stroke-opacity=".18" stroke-width="10" stroke-linecap="round"/>
      <path d="M110 300Q243 310 405 151" stroke="url(#story-trail)" stroke-width="1.5" stroke-dasharray="5 8"/>
      <g transform="translate(90 273) rotate(-18)">
        <path d="M0 15h43v19H0z" fill="#1d3543" stroke="#6b99a3"/>
        <path d="M-25 9h22v31h-22zM46 9h22v31H46z" fill="#172e40" stroke="#456f83"/>
        <path d="M-18 10v29m7-29v29M54 10v29m7-29v29" stroke="#5c8891" stroke-opacity=".55"/>
        <path d="M10 7a11 11 0 0 1 21 0l-11 8Z" fill="#b8dcd3" fill-opacity=".7"/>
        <path d="M21 5V-6m-4 0h8" stroke="#83e8c5" stroke-width="1.5"/>
        <circle cx="16" cy="24" r="2" fill="#83e8c5"/>
      </g>
      <g class="story-ship" transform="translate(405 151) rotate(-38)">
        <path d="m-34-8-23 8 23 8" stroke="#83e8c5" stroke-opacity=".35" stroke-width="3" stroke-linecap="round"/>
        <path d="m-28-8 35 8-35 8 9-8-9-8Z" fill="#c7e9e3" stroke="#9dc8c6"/>
        <path d="m-18-4 12 4-12 4" fill="#386070"/>
      </g>
      <circle cx="110" cy="300" r="43" stroke="#83e8c5" stroke-opacity=".12"/>
      <circle cx="110" cy="300" r="58" stroke="#83e8c5" stroke-opacity=".06"/>
      <text x="78" y="377" fill="#7caaa9" font-size="11" font-family="sans-serif">弥拉通信站</text>
      <text x="388" y="126" fill="#a0bebf" font-size="11" font-family="sans-serif">${mission.id <= 4 ? "信使号" : "远方的舰队"}</text>
    </svg>
    <div class="space-caption"><span class="status-dot"></span>${STORY[mission.id].location}</div>
  </div>`;
}

function storyHeader() {
  return `<header class="story-header">
    <a class="brand" href="${escapeHtml(siteHome.href)}" aria-label="返回知游游戏目录"><span class="brand-mark">${icon("dish")}</span><span><strong>深空通信站</strong><small>DEEP SPACE COMMS</small></span></a>
    <span class="story-chapter">第 ${String(mission.id).padStart(2, "0")} 章 <i></i>${mission.chapter}</span>
    <div class="story-header-actions">${musicButton()}<button class="story-menu-button" data-action="story-menu" aria-label="打开值班菜单">${icon("grid")}<span>值班菜单</span></button></div>
  </header>`;
}

function renderStory() {
  const chapter = STORY[mission.id];
  const intro = session.status === "playing" && session.guide.intro < chapter.scenes.length;
  const step = storyStep(session, mission);
  app.innerHTML = `<div class="story-shell ${intro ? "in-prologue" : "in-practice"}">
    ${storyHeader()}
    <main class="story-main">
      ${intro ? renderPrologue(chapter) : session.status !== "playing" ? renderStoryEnding() : `
        <div class="story-practice">
          <aside class="mentor-column">
            <div class="mentor-identity"><span class="mentor-avatar">岚<span></span></span><div><strong>${mission.independent ? "值班频道" : "林岚"}</strong><small>${mission.independent ? "独立任务 · 自行安排发送" : "值班长 · 带你熟悉操作"}</small></div><span class="radio-bars"><i></i><i></i><i></i><i></i></span></div>
            <div class="guide-chapter-line"><span>${session.round > 1 ? `轮次 ${session.round} / ${mission.rounds}` : "当前行动"}</span><span>${step.action === "dispatch" ? "自主安排" : `${session.guide.phase + 1} / ${chapter.steps.length}`}</span></div>
            <h1 id="guide-title" tabindex="-1">${step.title}</h1>
            <p class="mentor-speech">${step.text}</p>
            ${mission.independent ? `<div class="independent-objective"><span>本次目标</span><p>${mission.objective}</p><div><button class="text-button" data-action="hint">${icon("spark")}查看提示</button><button class="text-button" data-action="lesson" data-lesson="${mission.lesson}">${icon("book")}相关知识</button></div><small>能发送表示格式和预算通过检查；还需确认纠错是否够用、后续请求能否按时完成。</small></div>${renderPlanningBrief()}` : ""}
            <div class="mentor-next">${icon("arrow")}<span>${step.action === "packet" ? "点击消息卡片" : step.action === "send" ? "检查空间，然后发送" : step.action === "dispatch" ? "选择消息，再确认发送" : step.action === "demo" ? session.guide.demo ? "看懂码字后，点击「看懂了，准备发送」" : "先点击一种指令" : step.action === "quiz" ? session.guide.quiz === "0" ? "回答正确，把多数票用到消息上" : "选择你认为正确的答案" : step.action === "tree" ? "点击「打开码树」" : step.action === "lab" ? "点击「打开纠错实验」" : step.action === "protection" ? `选择「${PROTECTIONS[step.protection!].name}」` : step.action === "auto" ? "生成适合这些消息的码本" : "看完后，继续下一步"}</span></div>
            <div class="practice-space">${spaceScene()}</div>
          </aside>
          <section class="focus-card" aria-label="当前操作">
            <div class="focus-card-top"><span><span class="status-dot"></span>${mission.destination}</span><small>${mission.rounds > 1 ? `第 ${session.round} 轮` : "通信已连接"}</small></div>
            ${renderStoryTask(step)}
          </section>
        </div>
        <footer class="story-footer"><button class="text-button muted" data-action="replay-story">${icon("reset")}${mission.independent ? "重开本次任务" : "重看本章引导"}</button><span>进度自动保存</span>${mission.independent ? `<button class="text-button muted" data-action="hint">查看提示 ${icon("arrow")}</button>` : `<button class="text-button muted" data-action="skip-guide">自由操作 ${icon("arrow")}</button>`}</footer>
      `}
    </main>
  </div>`;
  if (!intro && session.status === "playing") updateStoryLive();
}

function renderPrologue(chapter: Chapter) {
  const index = session.guide.intro;
  const scene = chapter.scenes[index];
  return `<section class="prologue">
    <div class="prologue-art">${spaceScene()}<div class="prologue-art-label"><span class="mono">INCOMING TRANSMISSION</span><span>值班频道正在接入来电。</span></div></div>
    <div class="prologue-copy">
      <div class="scene-meta"><span class="status-dot"></span>${scene.role}</div>
      <h1 tabindex="-1" id="guide-title">${scene.title}</h1>
      <p class="scene-text">${scene.text}</p>
      <div class="scene-speaker"><span class="speaker-line"></span>${scene.speaker}</div>
      <button class="primary-button scene-continue" data-action="story-next">${scene.button}${icon("arrow")}</button>
      <div class="scene-bottom"><div class="scene-dots" aria-label="剧情 ${index + 1} / ${chapter.scenes.length}">${chapter.scenes.map((_, i) => `<span class="${i <= index ? "seen" : ""} ${i === index ? "current" : ""}"></span>`).join("")}</div><button class="text-button muted" data-action="skip-story">跳过剧情</button></div>
    </div>
  </section>`;
}

function storyPlan() {
  return `<div class="story-plan">
    <div class="story-plan-title"><span>本轮发送空间</span><span class="mono">BIT BUDGET</span></div>
    <div class="story-plan-value"><strong id="story-cost"></strong><span>/ ${roundConditions(mission, session.round).budget}<small> bit</small></span></div>
    <div id="story-budget-bar"></div>
    <p id="story-plan-explanation"></p>
  </div>`;
}

function renderPlanningBrief() {
  return `<div class="planning-brief">
    ${mission.windows ? `<div class="planning-heading">${icon("clock")}通信窗预报 <small>全部已知</small></div><div class="window-forecast">${mission.windows.map((_, i) => {
      const window = roundConditions(mission, i + 1);
      return `<div class="window-slot ${i + 1 === session.round ? "current" : ""} ${i + 1 < session.round ? "past" : ""}"><span>第 ${i + 1} 轮${i + 1 === session.round ? " · 当前" : ""}</span><strong>${window.budget}<small> bit</small></strong><em class="${window.noise.type === "none" ? "quiet-window" : ""}">${window.noise.label}</em></div>`;
    }).join("")}</div>` : ""}
    ${mission.totalBudget != null ? `<div class="total-budget"><span>整次值班剩余</span><strong>${mission.totalBudget - session.totalBits}<small> / ${mission.totalBudget} bit</small></strong><p>数据、保护、补位与同步全部计入。各轮余量不结转。</p></div>` : ""}
    ${mission.id >= 19 ? renderQueueOverview() : ""}
    ${mission.rounds > 1 ? `<details class="planning-records"><summary>前几轮发送记录 ${icon("chevron")}</summary>${session.history.length ? session.history.map((result, i) => `<button class="text-button" data-action="history" data-index="${i}">第 ${result.round} 轮 · ${result.totalBits} bit · ${result.skipped ? "等待" : result.packets.map(({ name }) => name).join("、")}</button>`).join("") : '<p>尚未发送。未来请求的频率和抵达轮次可在消息卡片上查看。</p>'}</details>` : ""}
  </div>`;
}

function renderQueueOverview() {
  return `<details class="queue-overview" ${queueOverviewOpen ? "open" : ""}><summary>整班请求总表 · ${mission.packets.length} 份 ${icon("chevron")}</summary>
    <p>频数与轮次全部已知。表格可横向滚动，发送方案由你安排。</p>
    <div class="queue-scroll" tabindex="0" role="region" aria-label="整班请求表，可横向滚动">
      <table><caption class="sr-only">各请求的指令频数、抵达轮次、截止轮次与交付状态</caption>
        <thead><tr><th scope="col">请求</th>${SYMBOLS.map(({ id, label }) => `<th scope="col">${id}<small>${label}</small></th>`).join("")}<th scope="col">抵达</th><th scope="col">截止</th><th scope="col">状态</th></tr></thead>
        <tbody>${mission.packets.map((packet, index) => {
          const counts = countSymbols(packet.tokens);
          const state = session.taskStates[packet.id];
          const status = state === "delivered" ? "已交付" : state === "failed" ? "解码错误" : state === "expired" ? "已超时" : !packetAvailable(packet, session.round) ? "未抵达" : packet.deadline === session.round ? "本轮到期" : "待发送";
          return `<tr><th scope="row"><span class="mono">MSG-${String(index + 1).padStart(3, "0")}</span>${packet.name}</th>${SYMBOLS.map(({ id }) => `<td class="mono">${counts[id]}</td>`).join("")}<td>${packet.releaseRound || 1}</td><td>${packet.deadline}</td><td>${status}</td></tr>`;
        }).join("")}</tbody>
      </table>
    </div></details>`;
}

function renderCostBreakdown() {
  const plan = planRound(session, mission);
  return `<details class="packet-breakdown"><summary>分包成本与补位 ${icon("chevron")}</summary><div id="packet-breakdown-content">${costBreakdownContent(plan)}</div></details>`;
}

function costBreakdownContent(plan: ReturnType<typeof planRound>) {
  if (!plan.validation.valid) return `<p>${plan.validation.message}</p>`;
  if (!plan.costs.length) return "<p>先选择消息，再比较每个包的实际成本。</p>";
  return `<div class="cost-row cost-labels"><span>消息包</span><span>数据</span><span>补位</span><span>发送</span></div>${plan.costs.map((item) => `<div class="cost-row"><span>${plan.selected.find(({ id }) => id === item.id)!.name}</span><code>${item.sourceBits}</code><code>${item.padding}</code><code>${item.cost}</code></div>`).join("")}<p>各包独立分块，不能把原始长度合并后再计算。${plan.syncBits ? `另含 ${plan.syncBits} bit 同步帧。` : ""}</p>`;
}

function storyTuning(open = false) {
  const codes = sessionCodes(session);
  return `<details class="story-tuning" ${open || tuningOpen ? "open" : ""}><summary>${icon("tree")}调整通信方案 ${icon("chevron")}</summary><div>
    <p class="tuning-label">编码方式</p><div class="segmented" role="group" aria-label="编码方式"><button data-action="coding" data-coding="fixed" aria-pressed="${session.coding === "fixed"}" class="${session.coding === "fixed" ? "chosen" : ""}">定长编码</button><button data-action="coding" data-coding="custom" aria-pressed="${session.coding === "custom"}" class="${session.coding === "custom" ? "chosen" : ""}" ${mission.id === 1 ? "disabled" : ""}>变长前缀码</button></div>
    ${mission.id >= 2 ? `<div class="story-code-tools"><button class="secondary-button" data-action="tree">${icon("tree")}打开码树</button>${mission.id >= 3 ? `<button class="secondary-button" data-action="auto">${icon("spark")}生成哈夫曼码</button>` : ""}</div>` : ""}
    ${mission.independent && mission.syncCost ? `<div class="receiver-codebook"><span>接收端正在使用</span><code>${SYMBOLS.map(({ id }) => `${id}=${session.receiverCodes[id]}`).join(" · ")}</code><button class="text-button" data-action="receiver-codes">沿用接收端码本</button></div>` : ""}
    ${session.coding === "custom" ? `<div class="story-code-inputs">${SYMBOLS.map(({ id, label }) => `<label>${label}<input class="code-input mono" data-code="${id}" value="${escapeHtml(codes[id])}" maxlength="10" inputmode="numeric" aria-label="${label}的二进制码字"></label>`).join("")}</div><p id="story-code-feedback"></p>` : ""}
    ${mission.id >= 4 ? `<p class="tuning-label">信道保护</p>${storyProtectionCards()}` : ""}
    ${mission.independent ? `<p class="auto-scope">自动工具只优化当前消息的信源长度，不考虑补位、同步和下一轮。</p>${renderCostBreakdown()}` : ""}
    <p class="tuning-note">先选消息，再优化码本。各消息包分别计算补位和保护成本。</p>
  </div></details>`;
}

function storyProtectionCards() {
  return `<div class="story-protections">${mission.protections.map((key) => `<button data-action="protection" data-protection="${key}" class="story-protection ${session.protection === key ? "chosen" : ""}" aria-pressed="${session.protection === key}">
    ${icon(key === "none" ? "arrow" : "shield")}<span><strong>${PROTECTIONS[key].name}</strong><small>${key === "none" ? "没有纠错保护" : key === "repeat" ? "1 位数据 → 3 位传输" : "4 位数据 → 7 位传输"}</small></span><span class="radio-dot"></span>
  </button>`).join("")}</div>`;
}

function renderStoryTask(step: StoryStep) {
  const counts = selectedCounts(session, mission);
  const plan = planRound(session, mission);
  if (step.action === "packet") return `<div class="story-task-body"><div class="focus-label">待处理的请求</div><div class="story-packets">${renderPackets()}</div>${session.selectedIds.length && !(session.selectedIds.length === 1 && session.selectedIds[0] === (step.packet || mission.packets[0].id)) ? '<p class="inline-guide-note">第一轮先只选救援请求。点击其他已选卡片可以取消。</p>' : ""}</div>`;
  if (step.action === "demo") {
    const chosen = SYMBOLS.find(({ id }) => id === session.guide.demo);
    return `<div class="story-task-body"><div class="focus-label">亲手试一次 · 指令变成比特</div>
      <div class="demo-commands">${SYMBOLS.map(({ id, label, color, glyph }) => `<button class="${id === session.guide.demo ? "chosen" : ""}" data-action="demo" data-symbol="${id}" aria-pressed="${id === session.guide.demo}"><span class="symbol-dot ${color}">${glyph}</span>${label}</button>`).join("")}</div>
      <div class="encode-demo">${chosen ? `<span class="demo-message">${chosen.glyph}<small>${chosen.label}</small></span>${icon("arrow")}<span class="demo-bits">${[...FIXED_CODES[chosen.id]].map((bit) => `<i>${bit}</i>`).join("")}</span>` : '<span class="demo-placeholder">选择上面的一种指令</span>'}</div>
      <p class="demo-caption">${chosen ? `“${chosen.label}”用 ${FIXED_CODES[chosen.id]} 表示。一位 0 或 1 叫一个比特，这条指令用了 2 bit。` : "接收端使用同一码本，把 0 和 1 还原成指令。"}</p>
      <button class="primary-button story-step-button" data-action="guide-next" ${chosen ? "" : "disabled"}>${step.button}${icon("arrow")}</button>
    </div>`;
  }
  if (["frequency", "entropy", "sync"].includes(step.id)) return `<div class="story-task-body"><div class="focus-label">这次要发的消息 · ${Object.values(counts).reduce((a, b) => a + b, 0)} 条指令</div>
    <div class="story-frequency">${SYMBOLS.map(({ id, label, color, glyph }) => `<div><span class="symbol-dot ${color}">${glyph}</span><strong>${label}</strong><div class="frequency-track"><i class="${color}" style="width:${counts[id] / Object.values(counts).reduce((a, b) => a + b, 0) * 100}%"></i></div><span>${counts[id]} 次</span></div>`).join("")}</div>
    ${step.id === "entropy" ? `<div class="story-learning-number"><span>这批消息的信息熵</span><strong>${entropy(counts).toFixed(3)} <small>bit / 指令</small></strong><p>比四种指令等概率时的 2 更低。</p><button class="text-button" data-action="lesson" data-lesson="entropy">想知道它怎么算？ ${icon("arrow")}</button></div>` : step.id === "sync" ? `<div class="story-small-comparison"><span>旧码本保护后</span><strong>77 bit</strong><span>可用空间</span><strong>65 bit</strong></div>` : '<p class="demo-caption">“前进”占一半。先看看频率，再给它安排更短的码字。</p>'}
    <button class="primary-button story-step-button" data-action="guide-next">${step.button}${icon("arrow")}</button></div>`;
  if (step.action === "tree") return `<div class="story-task-body"><div class="focus-label">按频率构造码树</div><div class="tree-intro"><div class="tree-intro-nodes"><span>2</span><span>2</span>${icon("arrow")}<span class="combined">4</span></div><p>先合并权重最小的两个节点。</p><small>将合并后的节点放回，再选最小的两个。</small></div><button class="primary-button story-step-button" data-action="tree">${icon("tree")}打开码树</button></div>`;
  if (step.action === "auto") return `<div class="story-task-body"><div class="focus-label">根据当前消息配置编码</div><div class="auto-preview">${icon("tree")}<strong>哈夫曼编码</strong><p>每次合并权重最低的两个节点，<br>自动生成可以逐条解码的前缀码。</p></div><button class="primary-button story-step-button" data-action="auto">${icon("spark")}生成哈夫曼码</button><button class="text-button optional-action" data-action="tree">也可以亲手构造码树</button></div>`;
  if (step.action === "quiz") return `<div class="story-task-body"><div class="focus-label">多数票实验 · 一位被翻转</div><div class="repeat-example"><span>原始</span><code>0 0 0</code>${icon("arrow")}<span>接收</span><code>0 <i>1</i> 0</code></div><p class="quiz-question">接收端应该恢复成哪个比特？</p><div class="quiz-options">${["0", "1"].map((answer) => `<button class="${session.guide.quiz === answer ? "chosen" : ""}" data-action="quiz" data-answer="${answer}" aria-pressed="${session.guide.quiz === answer}">${answer}</button>`).join("")}</div><p class="quiz-feedback" role="status">${session.guide.quiz === "0" ? "对，两个 0 占多数，所以恢复成 0。" : session.guide.quiz === "1" ? "再数一数：有两个 0、一个 1，多数票应该选谁？" : "选出占多数的比特。"}</p><button class="primary-button story-step-button" data-action="guide-next" ${session.guide.quiz === "0" ? "" : "disabled"}>${step.button}${icon("arrow")}</button></div>`;
  if (step.action === "lab") return `<div class="story-task-body"><div class="focus-label">用校验结果定位错误</div><div class="lab-intro"><div class="lab-intro-bits">${["p", "p", "1", "p", "0", "1", "1"].map((bit, i) => `<span class="${[0, 1, 3].includes(i) ? "parity" : ""}">${bit}</span>`).join("")}</div><p>4 位数据 + 3 位校验</p><small>翻转一位，看看三个校验结果怎样给出位置。</small></div><button class="primary-button story-step-button" data-action="lab">${icon("shield")}打开纠错实验</button></div>`;
  if (step.action === "protection") return `<div class="story-task-body"><div class="focus-label">选择一种发送保护</div>${storyProtectionCards()}<p class="demo-caption">${mission.noise.detail}</p><p class="inline-guide-note">点击「${PROTECTIONS[step.protection!].name}」继续。</p></div>`;
  if (["send", "dispatch"].includes(step.action)) return `<div class="story-task-body">
    ${step.action === "dispatch" ? `<div class="focus-label">先选择本轮消息</div><div class="story-packets dispatch-packets">${renderPackets({ groupFuture: mission.independent })}</div>` : `<div class="focus-label">发送前，最后确认</div><div class="story-envelope">${icon("send")}<div><strong>${plan.selected.map((packet) => packet.name).join("、") || "还没有选中消息"}</strong><small>${plan.selected.reduce((sum, packet) => sum + packet.tokens.length, 0)} 条指令 · ${PROTECTIONS[session.protection].short}</small></div></div>`}
    ${storyPlan()}
    ${step.action === "dispatch" || !plan.valid ? storyTuning(mission.independent || !plan.validation.valid) : ""}
    ${mission.id >= 4 ? `<p class="story-signal-note">${icon("pulse")}${roundConditions(mission, session.round).noise.detail}</p>` : ""}
    <button class="primary-button story-step-button" data-action="send" id="send-button">${icon("send")}发送本轮信号</button><p class="story-send-note" id="send-note"></p>
    ${step.action === "dispatch" && mission.rounds > 1 ? '<button class="text-button muted optional-action" data-action="wait">本轮暂不发送</button>' : ""}
  </div>`;
  return "";
}

function updateStoryLive() {
  const plan = planRound(session, mission);
  if ($("#story-cost")) {
    $("#story-cost").textContent = String(plan.totalBits);
    $("#story-cost").classList.toggle("danger-text", plan.totalBits > plan.budget);
    $("#story-budget-bar").innerHTML = `<div class="budget-track ${plan.totalBits > plan.budget ? "over-budget" : ""}"><i class="payload-fill" style="width:${Math.min(100, plan.payloadBits / plan.budget * 100)}%"></i><i class="sync-fill" style="width:${Math.max(0, Math.min(plan.syncBits / plan.budget * 100, 100 - plan.payloadBits / plan.budget * 100))}%"></i></div>`;
    const source = plan.costs.reduce((sum, packet) => sum + packet.sourceBits, 0);
    $("#story-plan-explanation").textContent = mission.id === 1 ? "16 条指令 × 每条 2 bit = 32 bit" : `${source} bit 数据${session.protection === "none" ? "" : ` → 保护后 ${plan.payloadBits} bit`}${plan.syncBits ? ` + 同步 ${plan.syncBits} bit` : ""}`;
    $<HTMLButtonElement>("#send-button").disabled = !plan.valid || busy || !storyCanSend(session, mission);
    $("#send-note").textContent = plan.reason || (mission.independent ? "格式和预算已通过检查。发送前再确认保护范围，并为后续请求留够空间。" : plan.syncBits ? "同步成本已计入，可以发送。" : "已就绪，可以发送并查看接收结果。");
    $("#send-note").classList.toggle("send-warning", !plan.valid);
  }
  if ($("#story-code-feedback")) $("#story-code-feedback").textContent = plan.validation.message;
  if ($("#packet-breakdown-content")) $("#packet-breakdown-content").innerHTML = costBreakdownContent(plan);
  for (const packet of mission.packets) {
    const cost = $(`#packet-cost-${packet.id}`);
    if (cost) cost.textContent = `${estimatePacketCost(packet)} bit`;
  }
  for (const input of document.querySelectorAll<HTMLInputElement>("[data-code]")) input.setAttribute("aria-invalid", String(plan.validation.ids.includes(input.dataset.code!)));
}

function renderStoryEnding() {
  const won = session.status === "won";
  return `<section class="prologue story-ending"><div class="prologue-art">${spaceScene()}</div><div class="prologue-copy">
    <div class="scene-meta"><span class="status-dot"></span>${won ? "接收端回信" : "通信复盘"}</div><h1>${won ? "本章必要请求已完成。" : "本章任务未完成。"}</h1>
    <p class="scene-text">${won ? STORY[mission.id].reply : "查看通信记录，检查解码错误和超时请求。调整方案后，可以用相同的干扰重试。"}</p>
    ${won ? stars(session.stars, "ending-stars") : ""}
    <button class="primary-button scene-continue" data-action="result">查看这次通信 ${icon("arrow")}</button>
    <div class="scene-bottom"><button class="text-button muted" data-action="restart">重新体验本章</button></div>
  </div></section>`;
}

function renderPackets({ groupFuture = false } = {}) {
  const currentCards: string[] = [];
  const futureCards: string[] = [];
  mission.packets.forEach((packet, index) => {
    const state = session.taskStates[packet.id];
    const selected = session.selectedIds.includes(packet.id);
    const resolved = state !== "pending";
    const future = !packetAvailable(packet, session.round);
    const counts = countSymbols(packet.tokens);
    const card = `<button class="packet-card ${selected ? "selected" : ""} ${resolved ? "resolved" : ""} ${future ? "future-packet" : ""}" data-action="packet" data-id="${packet.id}" ${resolved || future || busy || session.status !== "playing" ? "disabled" : ""} aria-pressed="${selected}">
      <div class="packet-card-top"><span class="packet-id mono">MSG-${String(index + 1).padStart(3, "0")}</span><span class="priority ${packet.priority === "紧急" ? "urgent" : packet.required === false ? "optional" : ""}">${packet.priority}</span></div>
      <div class="packet-title"><strong>${packet.name}</strong><span class="packet-check">${selected || state === "delivered" ? icon("check") : ""}</span></div>
      <p>${packet.description}</p>
      ${mission.independent ? `<div class="packet-frequencies" aria-label="指令频数">${SYMBOLS.map(({ id, glyph }) => `<span>${glyph} <b>${counts[id]}</b></span>`).join("")}</div>` : ""}
      <div class="packet-estimate"><span>当前方案</span><strong class="mono" id="packet-cost-${packet.id}">${estimatePacketCost(packet)} bit</strong></div>
      <div class="packet-footer"><span>${future ? `第 ${packet.releaseRound} 轮抵达 · ` : ""}${packet.tokens.length} 条指令</span><span class="${packet.deadline === session.round && !resolved ? "deadline-now" : ""}">${state === "delivered" ? "✓ 已交付" : state === "failed" ? "✕ 解码错误" : state === "expired" ? "✕ 已超时" : `第 ${packet.deadline} 轮截止`}</span></div>
    </button>`;
    (groupFuture && future ? futureCards : currentCards).push(card);
  });
  return currentCards.join("") + (futureCards.length ? `<details class="future-forecast" ${futureForecastOpen ? "open" : ""}><summary><span>未来请求预告 · ${futureCards.length} 条<small>展开查看频数、抵达轮次与期限，提前规划</small></span>${icon("chevron")}</summary><div>${futureCards.join("")}</div></details>` : "");
}

function estimatePacketCost(packet: Packet) {
  const codes = sessionCodes(session);
  if (!validateCodebook(codes).valid) return "—";
  return protectBits(encodeSource(packet.tokens, codes), session.protection).bits.length;
}

function renderDistribution() {
  const counts = selectedCounts(session, mission);
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  return SYMBOLS.map(({ id, label, color, glyph }) => `<div class="frequency-row"><span class="symbol-dot ${color}">${glyph}</span><span>${label}</span><div class="frequency-track"><i class="${color}" style="width:${counts[id] / total * 100}%"></i></div><span class="mono">${(counts[id] / total * 100).toFixed(counts[id] / total * 100 % 1 ? 1 : 0)}%</span></div>`).join("");
}

function renderCodeRows() {
  const counts = selectedCounts(session, mission);
  const codes = sessionCodes(session);
  return SYMBOLS.map(({ id, label, color, glyph }) => `<div class="code-row">
    <span class="code-symbol"><span class="symbol-dot ${color}">${glyph}</span>${label}</span>
    <span class="mono subtle" id="count-${id}">${counts[id]}</span>
    <label class="code-input-wrapper"><span class="sr-only">${label}的二进制码字</span><input class="code-input mono" data-code="${id}" value="${escapeHtml(codes[id])}" maxlength="10" inputmode="numeric" autocomplete="off" spellcheck="false" ${session.coding === "fixed" || session.status !== "playing" || busy ? "disabled" : ""}/></label>
    <span class="code-length mono" id="length-${id}">${codes[id].length}<small> bit</small></span>
  </div>`).join("");
}

function renderCodeFeedback() {
  const validation = validateCodebook(sessionCodes(session));
  return `<div class="code-feedback ${validation.valid ? "" : "invalid"}">${icon(validation.valid ? "check" : "info")}<span>${validation.message}</span></div>`;
}

function protectionNote() {
  const descriptions = {
    none: "没有纠错冗余。比特发生翻转后，接收端可能执行错误指令。",
    repeat: "每个三元组取多数票；保证纠正三元组内的一位错误。",
    hamming: "每个 7 位码块可纠正一位错误。数据尾部按需补 0。",
  };
  return `${icon("info")}<span>${descriptions[session.protection]}</span>`;
}

function renderMap() {
  return `<svg class="starmap" viewBox="0 0 310 177" role="img" aria-label="从弥拉通信站向${mission.destination}发送信号的航线">
    <defs><pattern id="map-grid" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M22 0H0V22" fill="none" stroke="#24404b" stroke-width=".5" opacity=".5"/></pattern><radialGradient id="map-glow"><stop stop-color="#7ce4c2" stop-opacity=".24"/><stop offset="1" stop-color="#7ce4c2" stop-opacity="0"/></radialGradient></defs>
    <rect width="310" height="177" fill="url(#map-grid)"/><circle cx="215" cy="54" r="65" fill="url(#map-glow)"/>
    <path d="M15 143 77 129 139 144 194 111 246 125 295 96" fill="none" stroke="#294651" stroke-width="1"/><path d="M35 31 82 59 146 28 185 48 257 17" fill="none" stroke="#203844" stroke-width="1"/>
    ${[[35, 31], [82, 59], [146, 28], [257, 17], [139, 144], [194, 111], [246, 125], [295, 96], [23, 80], [288, 63]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="#63818b"/>`).join("")}
    <path d="M68 123Q118 48 221 55" fill="none" stroke="#76e6c1" stroke-width="1.5" stroke-dasharray="4 5" class="map-route"/>
    <circle cx="68" cy="123" r="18" fill="#76e6c1" fill-opacity=".05" stroke="#76e6c1" stroke-opacity=".22"/><circle cx="68" cy="123" r="6" fill="#76e6c1"/>
    <circle cx="221" cy="55" r="15" fill="#76e6c1" fill-opacity=".07" stroke="#76e6c1" stroke-opacity=".3"/><circle cx="221" cy="55" r="5" fill="#bfeadd"/>
    <circle r="3" fill="#bffbe8"><animateMotion dur="3.5s" repeatCount="indefinite" path="M68 123Q118 48 221 55"/></circle>
    <text x="34" y="158" fill="#a2b9bf" font-size="10">弥拉通信站</text><text x="177" y="30" fill="#c0d8db" font-size="10">${mission.destination}</text>
    ${roundConditions(mission, session.round).noise.strength ? '<path d="m140 66 5-13 5 16 5-13" fill="none" stroke="#eabd7b" stroke-width="1.5"/><text x="129" y="92" fill="#b99569" font-size="9">干扰区域</text>' : '<text x="135" y="91" fill="#689e8c" font-size="9">连接稳定</text>'}
  </svg>`;
}

function renderLog() {
  if (!session.history.length) return `<div class="log-entry"><span class="log-dot"></span><div><span class="log-time mono">SYS · 00</span><p>链路已建立，接收端码本就绪。</p></div></div><div class="log-entry muted-entry"><span class="log-dot"></span><div><span class="log-time mono">WAITING</span><p>等待通信官配置并发送信号。</p></div></div>`;
  return session.history.slice(-3).reverse().map((result) => `<div class="log-entry"><span class="log-dot ${result.packets.some((packet) => !packet.delivered) || result.expired.length ? "error" : ""}"></span><div><span class="log-time mono">ROUND ${String(result.round).padStart(2, "0")} · ${result.totalBits} BIT</span><p>${result.skipped ? "本轮未发送。" : `${result.packets.filter((packet) => packet.delivered).length} / ${result.packets.length} 条消息正确交付。`}${result.expired.length ? ` ${result.expired.length} 条消息超时。` : ""}</p><button class="text-button small" data-action="history" data-index="${session.history.indexOf(result)}">查看解码过程 ↗</button></div></div>`).join("");
}

function updateLive() {
  if (!consoleMode) {
    updateStoryLive();
    return;
  }
  const plan = planRound(session, mission);
  const counts = selectedCounts(session, mission);
  const codes = sessionCodes(session);
  if (!$("#budget-label")) return;
  if ($("#packet-breakdown-content")) $("#packet-breakdown-content").innerHTML = costBreakdownContent(plan);
  $("#budget-label").innerHTML = `<strong class="${plan.totalBits > plan.budget ? "danger-text" : ""}">${plan.totalBits}</strong> / ${plan.budget} bit`;
  const payloadWidth = Math.min(plan.payloadBits / plan.budget * 100, 100);
  const syncWidth = Math.max(0, Math.min(plan.syncBits / plan.budget * 100, 100 - payloadWidth));
  $("#budget-bar").innerHTML = `<div class="budget-track ${plan.totalBits > plan.budget ? "over-budget" : ""}"><i class="payload-fill" style="width:${payloadWidth}%"></i><i class="sync-fill" style="width:${syncWidth}%"></i></div>`;
  $("#payload-label").textContent = String(plan.payloadBits);
  $("#sync-label").textContent = String(plan.syncBits);
  $("#remaining-label").textContent = String(Math.max(0, plan.remainingBits));
  $<HTMLButtonElement>("#send-button").disabled = !plan.valid || busy;
  $("#send-note").className = plan.reason && session.status === "playing" ? "send-warning" : "";
  $("#send-note").textContent = busy ? "信号正在传输，请稍候…" : session.status !== "playing" ? "本次任务已结束，可以查看结算或重试。" : plan.reason || (mission.independent ? "格式和预算已通过检查。发送前再确认保护范围，并为后续请求留够空间。" : "双方已共享码本。准备好就发送。");
  if (plan.syncBits && plan.valid) $("#send-note").textContent = `本轮先同步码本，额外 ${plan.syncBits} bit 已计入。`;
  $("#source-value").innerHTML = `${plan.costs.reduce((sum, packet) => sum + packet.sourceBits, 0)} <small>bit</small>`;
  $("#average-value").innerHTML = `${plan.validation.valid ? averageLength(counts, codes).toFixed(3) : "—"} <small>bit / 指令</small>`;
  $("#code-feedback").innerHTML = renderCodeFeedback();
  for (const { id } of SYMBOLS) {
    $(`#length-${id}`).innerHTML = `${codes[id].length}<small> bit</small>`;
    const input = $(`[data-code="${id}"]`);
    input.classList.toggle("input-invalid", plan.validation.ids.includes(id));
    input.setAttribute("aria-invalid", String(plan.validation.ids.includes(id)));
  }
  for (const packet of mission.packets) $(`#packet-cost-${packet.id}`).textContent = `${estimatePacketCost(packet)} bit`;
  $("#channel-protection").textContent = PROTECTIONS[session.protection].short;
}

function renderEndBanner() {
  const element = document.createElement("section");
  element.className = `end-banner ${session.status === "won" ? "" : "failed"}`;
  element.innerHTML = `<div>${icon(session.status === "won" ? "check" : "info")}<strong>${session.status === "won" ? "任务已完成" : "本次通信未能完成任务"}</strong>${session.status === "won" ? stars(session.stars) : ""}</div><button class="secondary-button" data-action="result">查看任务结算 ${icon("arrow")}</button>`;
  $(".main-content").insertBefore(element, $(".workspace"));
}

function setMission(id: number) {
  if ((id > progress.unlocked && !campaignEntries.includes(id)) || busy) return;
  const nextMission = MISSIONS.find((item) => item.id === id);
  if (!nextMission) return;
  mission = nextMission;
  if (campaignEntries.includes(id)) progress.unlocked = Math.max(progress.unlocked, id);
  tuningOpen = false;
  futureForecastOpen = false;
  queueOverviewOpen = false;
  session = prepareStory(createSession(mission), mission);
  closeModal();
  save();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function restart() {
  if (busy) return;
  tuningOpen = false;
  futureForecastOpen = false;
  queueOverviewOpen = false;
  session = prepareStory(createSession(mission), mission);
  closeModal();
  save();
  render();
  toast(consoleMode ? "本关已重置。干扰保持相同，可以比较新的通信方案。" : "本章从开场重新开始，已获得的星级会保留。");
}

function commitAction(action: string) {
  const tuning = $<HTMLDetailsElement>(".story-tuning");
  if (tuning) tuningOpen = tuning.open;
  const forecast = $<HTMLDetailsElement>(".future-forecast");
  if (forecast) futureForecastOpen = forecast.open;
  const overview = $<HTMLDetailsElement>(".queue-overview");
  if (overview) queueOverviewOpen = overview.open;
  const moved = !consoleMode && advanceStory(session, mission, action);
  save();
  render();
  if (moved) focusStory();
}

function focusStory() {
  requestAnimationFrame(() => {
    $("#guide-title")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

function openModal(type: string, extra: Omit<Modal, "type"> = {}) {
  if (busy && type !== "transmitting") return;
  if (!modal) lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  modal = { type, ...extra };
  app.inert = true;
  document.body.classList.add("modal-open");
  renderModal();
  requestAnimationFrame(() => {
    const focus = modalRoot.querySelector<HTMLElement>("[autofocus]") || modalRoot.querySelector<HTMLElement>("button:not(:disabled), input:not(:disabled)");
    focus?.focus();
  });
}

function closeModal() {
  if (busy) return;
  modal = null;
  app.inert = false;
  modalRoot.innerHTML = "";
  document.body.classList.remove("modal-open");
  if (lastFocus?.isConnected) lastFocus.focus();
}

function modalFrame(title: string, eyebrow: string, content: string, className = "") {
  return frame(title, eyebrow, content, className, busy);
}

function renderModal() {
  if (!modal) return;
  if (modal.type === "music") {
    modalRoot.innerHTML = modalFrame("值班配乐", "DEEP SPACE / ORIGINAL SCORE", renderMusicSettings(music.state), "music-modal");
  } else if (modal.type === "story-menu") {
    modalRoot.innerHTML = modalFrame("值班菜单", "MIRA COMMUNICATION STATION", `
      <p class="modal-intro">前五章学习基础，之后由你独立安排发送。熟悉编码与纠错后，可以从进阶航段开始，或直接接下返航值班。</p>
      <div class="story-menu-options"><button class="secondary-button" data-action="replay-story">${icon("reset")}重新体验本章剧情</button><button class="secondary-button" data-action="console-mode">${icon("grid")}打开完整控制台</button><button class="secondary-button" data-action="academy">${icon("book")}查阅通信手册</button><button class="secondary-button" data-action="music">${icon("music")}音乐设置</button></div>
      <div class="challenge-entry"><div><strong>熟悉编码和纠错？</strong><p>可以从第 9 航段开始，后续逐关解锁，自行设计方案。</p></div><button class="secondary-button" data-action="mission" data-id="9">进入进阶航段 ${icon("arrow")}</button></div>
      <div class="challenge-entry"><div><strong>继续第 12 关之后的值班</strong><p>第 13 航段起需要规划整次发送。后续会用到手工码本、混合保护和六轮队列，提示按需查看。</p></div><button class="secondary-button" data-action="mission" data-id="13">接通返航线 ${icon("arrow")}</button></div>
      <div class="challenge-entry"><div><strong>准备好排一整班了吗？</strong><p>从第 19 航段起综合使用已有知识。队列逐步增至三十份请求，终关建议预留 1～2 小时独立规划。</p></div><button class="secondary-button" data-action="mission" data-id="19">进入综合值班 ${icon("arrow")}</button></div>
      ${chapterRanges.map(([first, last, title]) => `<div class="small-section-title">${title}<span>${first === 1 ? "剧情互动教学" : first === 6 ? "自主设计通信方案" : first === 9 ? "窗口与同步" : first === 13 ? "完整计划与手工码本" : "综合调度与预算"}</span></div><div class="chapter-choices">${MISSIONS.filter(({ id }) => id >= first && id <= last).map((item) => `<button class="chapter-choice ${item.id === mission.id ? "current" : ""}" data-action="mission" data-id="${item.id}" ${item.id > progress.unlocked && !campaignEntries.includes(item.id) ? "disabled" : ""}><span class="mono">${String(item.id).padStart(2, "0")}</span><strong>${item.chapter}${progress.soloBest?.[item.id] ? '<small class="solo-mark">独立通过</small>' : ""}</strong>${progress.best[item.id] ? stars(progress.best[item.id]) : item.id > progress.unlocked && !campaignEntries.includes(item.id) ? icon("lock") : icon("arrow")}</button>`).join("")}</div>`).join("")}
      <p class="microcopy">重新体验会重置本章当前的发送记录，已经获得的星级与解锁进度会保留。</p>
      <p class="microcopy">档案保存在这台设备的当前浏览器中。换设备、换网址或清理浏览器数据后，进度不会自动同步。</p>
    `, "story-menu-modal");
  } else if (modal.type === "help") {
    modalRoot.innerHTML = modalFrame("值班操作说明", "OPERATOR HANDBOOK", `
      <p class="modal-intro">你负责给舰队发送导航指令。按消息频率设计编码，根据干扰选择保护，让指令在截止时间前准确送达。</p>
      <div class="help-steps">${[
        ["01", "选择消息", "左侧勾选本轮要发的消息，查看频率和截止时间。"],
        ["02", "设计编码", "在工作台选择定长或前缀码。常见指令可以用更短的码字。"],
        ["03", "抵抗干扰", "根据右侧的错误模型配置保护，并检查完整的比特预算。"],
        ["04", "发送与复盘", "发送后查看真实的比特翻转、解码过程和任务结果。"],
      ].map(([n, title, description]) => `<div><span class="step-number">${n}</span><section><h3>${title}</h3><p>${description}</p></section></div>`).join("")}</div>
      <div class="info-block">${icon("info")}新玩家可以从剧情开始，由林岚带着完成第一条消息。通过后逐步解锁新知识，随时从值班菜单重看本章。</div>
      <div class="modal-actions"><button class="secondary-button" data-action="close">返回</button><button class="primary-button" data-action="replay-story">从本章剧情开始 ${icon("arrow")}</button></div>
    `, "help-modal");
  } else if (modal.type === "lesson") {
    const lesson = modal.lesson ? LESSONS[modal.lesson] : undefined;
    if (!lesson) return;
    modalRoot.innerHTML = modalFrame(lesson.title, "FIELD NOTES / 信息论手册", `
      <p class="modal-intro">${lesson.intro}</p><div class="formula">${escapeHtml(lesson.formula)}</div>
      <div class="lesson-prose">${lesson.paragraphs.map((text) => `<p>${text}</p>`).join("")}</div>
      <div class="modal-actions"><button class="primary-button" data-action="close">回到工作台 ${icon("arrow")}</button></div>
    `, "lesson-modal");
  } else if (modal.type === "academy") {
    modalRoot.innerHTML = modalFrame("通信手册", "THE SCIENCE BEHIND THE SIGNAL", `
      <p class="modal-intro">这里可以查码字、信息熵、纠错和调度的规则，也有计算示例。看完后回到任务，试着算出自己的发送方案。</p>
      <div class="academy-grid">${Object.entries(LESSONS).map(([key, lesson], index) => `<button class="academy-card" data-action="lesson" data-lesson="${key}"><span class="mono subtle">NOTE ${String(index + 1).padStart(2, "0")}</span><strong>${lesson.title}</strong><p>${lesson.intro}</p><span class="text-button">阅读笔记 ${icon("arrow")}</span></button>`).join("")}</div>
      <div class="model-note"><strong>模拟边界</strong><p>消息和频率已知；没有同步费用的关卡预共享码本，不计包头开销。各消息包单独编码、补位和纠错。部分关卡增加固定 12 bit 的可靠码本同步控制帧。进阶关的预报与未来消息也是公开的确定条件。预算是游戏中的发送长度限制，不代表香农信道容量。</p><p>发送后以原始消息核对交付，用于教学复盘；真实接收端若无额外校验，并不总能知道消息是否错误。</p></div>
    `, "wide-modal");
  } else if (modal.type === "hint") {
    const hints = mission.hints || [mission.hint];
    const level = Math.max(1, session.hintLevel || 1);
    modalRoot.innerHTML = modalFrame("本关提示", `MISSION ${String(mission.id).padStart(2, "0")} / STRATEGY`, `
      <div class="hint-levels">${hints.slice(0, level).map((text, i) => `<section><span>${["思考方向", "关键约束", "完整参考方案"][i]}</span><p>${text}</p></section>`).join("")}</div><div class="info-block">${icon("spark")}${mission.independent ? "查看提示不会扣星，本次通关会标为“参考提示”。重新开始后，不看提示通关可记录为“独立通过”。" : "查看提示不会扣星。可以先算一遍成本，再回去尝试。"}</div>
      <div class="modal-actions">${level < hints.length ? `<button class="secondary-button" data-action="hint-more">${level === 1 ? "再给一点思路" : "查看完整方案"}</button>` : ""}<button class="primary-button" data-action="close">回去试试看 ${icon("arrow")}</button></div>
    `);
  } else if (modal.type === "tree") renderTreeModal();
  else if (modal.type === "lab") renderLabModal();
  else if (modal.type === "transmitting") renderTransmittingModal();
  else if (modal.type === "result") {
    const result = modal.result || session.history.at(-1);
    if (!result) return;
    modalRoot.innerHTML = !consoleMode && !modal.historical && !modal.detailed
      ? storyResult(session, mission, result) : detailedResult(session, mission, result, modal.historical);
  }
  updateMusicUI();
}

function openTree() {
  treeState = createTree(selectedCounts(session, mission));
  openModal("tree");
}

function renderTreeModal() {
  const learning = !consoleMode && storyStep(session, mission).action === "tree";
  modalRoot.innerHTML = modalFrame("构造码树", "HUFFMAN WORKSHOP", renderTree(treeState, selectedCounts(session, mission), learning), "tree-modal");
}

function mergeTreeNodes() {
  mergeTree(treeState);
  renderTreeModal();
}

function openLab() {
  labState = { data: "1011", flipped: [], corrected: false };
  openModal("lab");
}

function renderLabModal() {
  const learning = !consoleMode && storyStep(session, mission).action === "lab";
  modalRoot.innerHTML = modalFrame("汉明纠错实验", "HAMMING (7,4) / INTERACTIVE LAB", renderLab(labState, learning), "lab-modal");
}

function renderTransmittingModal() {
  const phase = modal?.phase || 0;
  const titles = ["正在编码消息", "信号穿过干扰区域", "接收端正在恢复数据"];
  modalRoot.innerHTML = modalFrame(titles[phase], "TRANSMISSION IN PROGRESS", `
    <div class="transmit-animation"><span class="transmit-station">${icon("dish")}</span><div class="transmit-stream">${Array.from({ length: 12 }, (_, i) => `<span style="--delay:${i * -.16}s">${i % 3 ? "0" : "1"}</span>`).join("")}</div><span class="transmit-station">${icon("shield")}</span></div>
    <div class="transmit-phases">${["信源编码", "信道传输", "纠错与解码"].map((text, index) => `<span class="${index <= phase ? "active" : ""}">${index < phase ? "✓" : `0${index + 1}`} ${text}</span>`).join("")}</div>
    <p class="microcopy centered">噪声固定，结果由你的编码和保护方案决定。</p>
  `, "transmitting-modal");
}

function transmit() {
  if (busy || !planRound(session, mission).valid || (!consoleMode && !storyCanSend(session, mission))) return;
  let transmission;
  try {
    transmission = transmitRound(session, mission);
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
    return;
  }
  busy = true;
  render();
  openModal("transmitting", { phase: 0 });
  setTimeout(() => { if (modal) modal.phase = 1; renderTransmittingModal(); }, 500);
  setTimeout(() => { if (modal) modal.phase = 2; renderTransmittingModal(); }, 1100);
  setTimeout(() => {
    busy = false;
    session = transmission.next;
    recordProgress();
    save();
    render();
    openModal("result", { result: transmission.result });
  }, 1750);
}

function recordProgress() {
  if (session.status !== "won") return;
  progress.best[mission.id] = Math.max(progress.best[mission.id] || 0, session.stars);
  if (mission.independent && !session.hintLevel) {
    progress.soloBest ||= {};
    progress.soloBest[mission.id] = Math.max(progress.soloBest[mission.id] || 0, session.stars);
  }
  progress.unlocked = Math.max(progress.unlocked, Math.min(MISSIONS.length, mission.id + 1));
}

function handleAction(action: string, button: HTMLElement) {
  if (busy) return;
  switch (action) {
    case "music":
      if (!music.settings.enabled) music.setEnabled(true);
      openModal("music"); break;
    case "music-toggle": music.setEnabled(!music.settings.enabled); break;
    case "music-track":
      music.setTrack(button.dataset.track!);
      if (!music.settings.enabled) music.setEnabled(true);
      break;
    case "home": closeModal(); window.scrollTo({ top: 0, behavior: "smooth" }); break;
    case "mission": setMission(Number(button.dataset.id)); break;
    case "story-menu": openModal("story-menu"); break;
    case "story-next":
      session.guide.intro = Math.min(session.guide.intro + 1, STORY[mission.id].scenes.length);
      save(); render(); focusStory(); break;
    case "skip-story":
      session.guide.intro = STORY[mission.id].scenes.length;
      save(); render(); focusStory(); break;
    case "guide-next": commitAction("next"); break;
    case "demo": session.guide.demo = button.dataset.symbol!; save(); render(); break;
    case "quiz": session.guide.quiz = button.dataset.answer!; save(); render(); break;
    case "skip-guide":
      session.guide.intro = STORY[mission.id].scenes.length;
      session.guide.skipped = true; closeModal(); save(); render(); focusStory(); break;
    case "replay-story":
      consoleMode = false; progress.consoleMode = false; restart(); focusStory(); break;
    case "console-mode":
      consoleMode = true; progress.consoleMode = true; closeModal(); save(); render(); break;
    case "story-mode":
      consoleMode = false; progress.consoleMode = false; closeModal(); save(); render(); break;
    case "academy": openModal("academy"); break;
    case "help": openModal("help"); break;
    case "lesson":
      if (!progress.lessons.includes(button.dataset.lesson!)) progress.lessons.push(button.dataset.lesson!);
      save();
      openModal("lesson", { lesson: button.dataset.lesson });
      break;
    case "hint":
      session.hintLevel = Math.max(1, session.hintLevel || 0); save(); openModal("hint"); break;
    case "hint-more":
      session.hintLevel = Math.min((mission.hints || [mission.hint]).length, (session.hintLevel || 1) + 1);
      save(); renderModal(); break;
    case "close": closeModal(); break;
    case "restart": restart(); break;
    case "packet":
      if (session.selectedIds.includes(button.dataset.id!)) session.selectedIds = session.selectedIds.filter((id) => id !== button.dataset.id);
      else session.selectedIds.push(button.dataset.id!);
      commitAction("packet"); break;
    case "coding":
      if (!["fixed", "custom"].includes(button.dataset.coding || "")) return;
      session.coding = button.dataset.coding as Coding; commitAction("coding"); break;
    case "receiver-codes":
      session.customCodes = { ...session.receiverCodes }; session.coding = "custom"; commitAction("receiver-codes"); break;
    case "protection":
      if (!mission.protections.includes(button.dataset.protection as Protection)) return;
      session.protection = button.dataset.protection as Protection; commitAction("protection"); break;
    case "auto":
      session.customCodes = makeHuffman(selectedCounts(session, mission)).codes;
      session.coding = "custom"; commitAction("auto"); if (consoleMode) toast("已根据所选消息的频率生成哈夫曼码。"); break;
    case "tree": openTree(); break;
    case "tree-select":
      if (treeState.selected.includes(button.dataset.id!)) treeState.selected = treeState.selected.filter((id) => id !== button.dataset.id);
      else if (treeState.selected.length < 2) treeState.selected.push(button.dataset.id!);
      else { toast("一次只能合并两个节点，先取消一个选择。"); return; }
      renderTreeModal(); break;
    case "tree-merge": mergeTreeNodes(); break;
    case "tree-undo": {
      const previous = treeState.undo.pop();
      if (!previous) return;
      treeState.forest = previous.forest; treeState.next = previous.next; treeState.selected = [];
      treeState.feedback = "已撤销上次合并。可以重新选择两个节点。"; renderTreeModal(); break;
    }
    case "tree-reset": openTree(); break;
    case "tree-apply":
      session.customCodes = treeToCodes(treeState.forest[0]);
      session.coding = "custom"; closeModal(); commitAction("tree-apply"); if (consoleMode) toast("新码本已应用，可以查看传输预算。"); break;
    case "lab": openLab(); break;
    case "lab-flip": {
      const position = Number(button.dataset.position);
      labState.flipped = labState.flipped.includes(position) ? labState.flipped.filter((n) => n !== position) : [...labState.flipped, position];
      labState.corrected = false; renderLabModal(); break;
    }
    case "lab-reset": labState.flipped = []; labState.corrected = false; renderLabModal(); break;
    case "lab-correct": labState.corrected = true; renderLabModal(); break;
    case "lab-return":
      if (labState.corrected && labState.flipped.length === 1) { closeModal(); commitAction("lab-proof"); }
      break;
    case "send": transmit(); break;
    case "history": openModal("result", { result: session.history[Number(button.dataset.index)], historical: true }); break;
    case "result": openModal("result"); break;
    case "detail-result": openModal("result", { result: modal?.result || session.history.at(-1), detailed: true }); break;
    case "wait": {
      if (!consoleMode && storyStep(session, mission).action !== "dispatch") return;
      const outcome = waitRound(session, mission);
      session = outcome.next; recordProgress(); save(); render(); openModal("result", { result: outcome.result }); break;
    }
  }
}

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLElement>("[data-action]");
  if (button && !(button instanceof HTMLButtonElement && button.disabled)) {
    if (button.tagName === "A") event.preventDefault();
    handleAction(button.dataset.action!, button);
    return;
  }
  if (event.target.classList.contains("modal-backdrop")) closeModal();
});

document.addEventListener("input", (event) => {
  if (!(event.target instanceof HTMLInputElement)) return;
  const input = event.target;
  if (input.id === "music-volume") music.setVolume(Number(input.value) / 100);
  if (input.dataset.code && !busy && session.status === "playing" && session.coding === "custom") {
    session.customCodes[input.dataset.code] = input.value.trim();
    save(); updateLive();
  }
  if (input.id === "lab-data") {
    const selection = input.selectionStart;
    labState.data = input.value;
    labState.flipped = []; labState.corrected = false;
    renderLabModal();
    $("#lab-data").focus();
    $<HTMLInputElement>("#lab-data").setSelectionRange(selection, selection);
  }
});

document.addEventListener("toggle", (event) => {
  if (!(event.target instanceof HTMLDetailsElement)) return;
  if (event.target.classList.contains("story-tuning")) tuningOpen = event.target.open;
  if (event.target.classList.contains("future-forecast")) futureForecastOpen = event.target.open;
  if (event.target.classList.contains("queue-overview")) queueOverviewOpen = event.target.open;
}, true);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
  if (event.key === "Tab" && modal) {
    const focusable = [...modalRoot.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), summary, a[href]")];
    if (!focusable.length) { event.preventDefault(); return; }
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && (document.activeElement === first || !modalRoot.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !modalRoot.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  }
  if (event.key === "Enter" && !modal && !busy && !["INPUT", "BUTTON", "A", "SUMMARY"].includes(document.activeElement?.tagName || "")) {
    event.preventDefault(); transmit();
  }
});

// Restored preferences wait for an interaction; no sound or audio download on first visit.
function resumeMusic() {
  if (music.settings.enabled && (!music.unlocked || music.context?.state === "suspended")) music.unlock();
}
document.addEventListener("pointerdown", resumeMusic, { passive: true });
document.addEventListener("keydown", resumeMusic);
document.addEventListener("visibilitychange", () => music.setHidden(document.hidden));
window.addEventListener("pagehide", () => music.setHidden(true));
window.addEventListener("pageshow", () => music.setHidden(document.hidden));

render();
