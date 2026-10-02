import { escapeHtml as h } from "../../shared/html.js";
import { adjust, analyze, cutFor, execute, moves, placeName, routeError, targets, walk } from "./engine.js";
import type { Analysis, Mission } from "./engine.js";
import { MISSIONS } from "./missions.js";
import { advanceGuide, guideLength, guideReady, guideStep, guideText } from "./story.js";
import { readSave, recordScore, SAVE_KEY, startChapter, writeSave } from "./storage.js";

const root = document.querySelector<HTMLElement>("#app");
const notice = document.querySelector<HTMLElement>("#notice");
if (!root || !notice) throw new Error("缺少补给网页面入口。");
const testMode = new URLSearchParams(location.search).has("test");
const key = testMode ? "mountain-network-test-v1" : SAVE_KEY;
const save = readSave(key);
let menu = false;
let storageFailed = false;
const mission = (): Mission => MISSIONS[save.activeId - 1];
const pathName = (nodes: readonly string[]): string => nodes.map((id) => placeName(mission(), id)).join(" → ");
const announce = (text: string): void => { notice!.textContent = text; };
const persist = (): void => { storageFailed = !writeSave(key, save); };

function renderMap(analysis: Analysis, editing: boolean): string {
  const current = mission();
  const nodes = walk(current, save.codes) ?? [current.source];
  const available = moves(current, save.routes, save.editing === "residual");
  const next = available.filter((move) => move.from === nodes.at(-1) && !nodes.includes(move.to));
  const cut = current.certificate ? cutFor(current, save.side) : null;
  const lines = current.edges.map((edge) => {
    const from = current.places.find((place) => place.id === edge.from)!;
    const to = current.places.find((place) => place.id === edge.to)!;
    const dx = (to.x - from.x) * 7;
    const dy = (to.y - from.y) * 4.2;
    const length = Math.hypot(dx, dy);
    const x1 = from.x * 7 + dx / length * 42;
    const y1 = from.y * 4.2 + dy / length * 22;
    const x2 = to.x * 7 - dx / length * 45;
    const y2 = to.y * 4.2 - dy / length * 24;
    const bend = current.id === 2 && edge.id === "ST" ? -65
      : current.id === 8 && edge.id === "AT" ? -65 : current.id === 8 && edge.id === "BU" ? 140 : 0;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const label = `${current.id >= 3 ? `${analysis.flow[edge.id]}/${edge.capacity} 箱` : ""}${current.id >= 2 ? `${current.id >= 3 ? " · " : ""}${edge.cost} 点` : ""}`;
    const selected = save.codes.includes(edge.id) || save.codes.includes(`-${edge.id}`);
    const crossing = cut?.edges.includes(edge.id);
    const className = analysis.flow[edge.id] > edge.capacity ? "over" : crossing ? "crossing" : selected ? "selected" : analysis.flow[edge.id] ? "used" : "";
    const reverse = editing && save.editing === "residual" && analysis.flow[edge.id] > 0;
    return `<g class="road ${className}"><path d="M${x1} ${y1} Q${midX} ${midY + bend} ${x2} ${y2}" marker-end="url(#arrow)" />
      ${label ? `<text x="${midX}" y="${midY + bend / 2 - 10}" text-anchor="middle">${h(label)}</text>` : ""}
      ${reverse ? `<path class="reverse-road" d="M${x2} ${y2 + 9} Q${midX} ${midY + bend + 9} ${x1} ${y1 + 9}" marker-end="url(#back-arrow)" />` : ""}</g>`;
  }).join("");
  return `<div class="map-scroll" tabindex="0" role="region" aria-label="路网地图，可横向滚动"><div class="network-map"><svg viewBox="0 0 700 420" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker>
    <marker id="back-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>
    <path class="hill" d="M0 365 L145 160 L300 355 L430 105 L700 370" />${lines}</svg>
    ${current.places.map((place) => `<button class="map-node ${place.need ? "destination" : ""} ${nodes.includes(place.id) && editing ? "on-path" : ""} ${cut && save.side.includes(place.id) ? "source-side" : ""}"
      style="left:${place.x}%;top:${place.y}%" data-node="${place.id}" ${!editing || save.result || (place.id !== current.source && !next.some((move) => move.to === place.id)) ? "disabled" : ""}
      aria-label="${h(place.name)}${place.need ? `，需要 ${place.need} 箱` : ""}">${h(place.name)}${place.need ? `<small>需 ${place.need} 箱</small>` : ""}</button>`).join("")}</div></div>
    <p class="mobile-map-note">地图可横向滚动，也可用下面的通道按钮选路线。</p>
    <p class="map-legend">${current.id >= 3 ? "通道标记为“已安排 / 容量”，箱数是整箱补给。" : "箭头表示允许走的方向。"}
    ${current.id >= 2 ? "费用按每箱经过该通道计。" : ""}${editing && save.editing === "residual" ? "虚线箭头表示撤回草案，撤回费用也会从草案中扣除。" : ""}
    ${cut ? "橙色通道从选定的总仓侧跨出。" : ""}</p>`;
}

function renderBuilder(): string {
  const current = mission();
  const nodes = walk(current, save.codes) ?? [current.source];
  const available = moves(current, save.routes, save.editing === "residual");
  const next = targets(current).some((place) => place.id === nodes.at(-1)) ? [] : available.filter((move) =>
    move.from === nodes.at(-1) && !nodes.includes(move.to));
  const complete = targets(current).some((place) => place.id === nodes.at(-1));
  const selected = save.codes.map((code) => available.find((move) => move.code === code));
  const limit = selected.length && selected.every(Boolean) ? Math.min(...selected.map((move) => move!.available)) : 0;
  const fee = selected.reduce((sum, move) => sum + (move?.cost ?? 0), 0);
  return `<section class="builder" aria-labelledby="builder-title"><h2 id="builder-title">${save.editing === "residual" ? "调整草案" : "选择运输路线"}</h2>
    ${current.id >= 5 ? `<div class="actions"><button data-command="route-mode" aria-pressed="${save.editing === "route"}">普通路线</button>
    <button data-command="residual-mode" aria-pressed="${save.editing === "residual"}">调整草案</button></div>` : ""}
    <p class="path">${h(pathName(nodes))}</p>
    <div class="choices">${next.map((move) => `<button data-move="${move.code}">${move.reverse ? "撤回到" : "去"}${h(placeName(current, move.to))}
      ${current.id >= 3 ? `<small>可${move.reverse ? "撤回" : "增加"} ${move.available} 箱</small>` : ""}</button>`).join("")}</div>
    ${!complete && !next.length ? `<p class="error">这条草案路径没有可继续的通道。可以退回一步，${current.id >= 5 ? "切换调整草案，或" : ""}修改已安排路线。</p>` : ""}
    ${current.id >= 2 && save.codes.length ? `<p>这条${save.editing === "residual" ? "调整路径" : "路线"}每箱${fee < 0 ? "退回" : "增加"}费用 ${Math.abs(fee)} 点${current.id >= 3 ? `，沿途最多${save.editing === "residual" ? "调整" : "再安排"} ${limit} 箱` : ""}。</p>` : ""}
    <div class="actions"><label class="quantity">箱数<input id="new-amount" type="number" min="1" max="100" step="1" value="${save.amount}" data-field="amount" /></label>
    <button class="primary" data-command="add" ${complete ? "" : "disabled"}>${save.editing === "residual" ? "应用调整" : "加入运输草案"}</button>
    <button data-command="back" ${save.codes.length ? "" : "disabled"}>退回一步</button><button data-command="clear-path" ${save.codes.length ? "" : "disabled"}>重新选路线</button></div>
    <p class="muted">加入或修改草案后还没有发出。${current.id >= 5 ? "调整路径每次增加从总仓到接收点的交付量，手动删改路线也能重新分配。" : ""}</p></section>`;
}

function renderRoutes(): string {
  return `<section class="routes" aria-labelledby="routes-title"><h2 id="routes-title">本班运输草案</h2>
    ${save.routes.length ? save.routes.map((route, index) => `<div class="route-row"><p>${h(pathName(route.nodes))}</p>
    <label>箱数<input type="number" min="1" max="100" step="1" value="${route.amount}" data-route="${index}" ${save.result ? "disabled" : ""} aria-label="路线 ${index + 1} 的箱数" /></label>
    <button data-remove="${index}" ${save.result ? "disabled" : ""} aria-label="删除路线 ${index + 1}">删除</button></div>`).join("")
      : "<p class=\"muted\">先选一条从总仓到接收点的路线，再把箱子加入草案。</p>"}</section>`;
}

function renderCut(analysis: Analysis): string {
  const current = mission();
  const cut = cutFor(current, save.side);
  return `<section class="cut-box"><h2>运输上限证明</h2><p>选择分界的总仓侧。总仓必须在这一侧，河岸站必须在另一侧。
    从这一侧跨出的通道容量之和，是本班运输量的上限。交付量与上限相等，证明已达到最大流。</p>
    <fieldset ${save.result ? "disabled" : ""}><legend>总仓侧的地点</legend>${current.places.map((place) =>
      `<label><input type="checkbox" data-cut="${place.id}" ${save.side.includes(place.id) ? "checked" : ""} ${place.id === current.source || place.need ? "disabled" : ""} />${h(place.name)}</label>`).join("")}</fieldset>
    <p class="observation">分界容量 <strong>${cut?.capacity ?? "未选定"} 箱</strong> · 当前交付 <strong>${analysis.total} 箱</strong></p>
    ${cut ? `<details><summary>查看跨出分界的通道</summary><ul>${cut.edges.map((id) => {
      const edge = current.edges.find((item) => item.id === id)!;
      return `<li>${h(placeName(current, edge.from))} → ${h(placeName(current, edge.to))}：${edge.capacity} 箱</li>`;
    }).join("")}</ul></details>` : ""}</section>`;
}

function renderConditions(analysis: Analysis): string {
  const current = mission();
  return `<details class="conditions"><summary>完整条件与通道占用</summary><p>总仓有 ${current.supply} 箱，预算 ${current.budget} 点。
    ${current.costGoal !== undefined ? `本章通过要求费用最多 ${current.costGoal} 点。` : ""}满足各接收点需求${current.certificate ? "并提交相等的分界上限" : ""}可获 2 星，费用不超过 ${current.efficient} 点为 3 星。</p>
    <div class="table-wrap"><table><caption>所有通道条件，几何距离不计费用</caption><thead><tr><th>通道</th><th>每班容量</th><th>每箱费用</th><th>已安排</th><th>剩余</th></tr></thead><tbody>
    ${current.edges.map((edge) => `<tr><th>${h(placeName(current, edge.from))} → ${h(placeName(current, edge.to))}</th>
    <td>${edge.capacity} 箱</td><td>${edge.cost} 点</td><td>${analysis.flow[edge.id]} 箱</td><td>${edge.capacity - analysis.flow[edge.id]} 箱</td></tr>`).join("")}</tbody></table></div></details>`;
}

function renderResult(): string {
  const current = mission();
  const result = save.result!;
  return `<section class="card result ${result.passed ? "success" : "failure"}" aria-labelledby="result-title"><p class="eyebrow">班次结束 · 接收站回报</p>
    <h1 id="result-title">${result.passed ? "补给已经接上" : "本班还需要调整"}</h1>
    ${targets(current).map((place) => `<p>${h(result.analysis.delivered[place.id] >= place.need! ? place.reply
      : `${place.name}收到 ${result.analysis.delivered[place.id]} 箱，原定的 ${place.need} 箱还没有补齐。`)}</p>`).join("")}
    <p class="recap">${h(current.recap)}</p>${result.failures.length ? `<ul class="error">${result.failures.map((text) => `<li>${h(text)}</li>`).join("")}</ul>`
      : `<p>本次 ${result.stars} 星 · ${save.hinted ? "参考提示通过" : "独立通过"}。</p>`}
    <details><summary>查看执行路线、费用与上限证明</summary><p>共交付 ${result.analysis.total} 箱，费用 ${result.analysis.cost} 点。
    ${current.certificate ? `分界容量 ${result.cut?.capacity ?? "无有效分界"} 箱。` : ""}</p>
    <ul>${save.routes.map((route) => `<li>${h(pathName(route.nodes))}：${route.amount} 箱</li>`).join("")}</ul>${renderConditions(result.analysis)}</details>
    <div class="actions"><button data-command="retry">调整并重试</button>
    ${result.passed && current.id < MISSIONS.length ? '<button class="primary" data-command="next">接下一章调度单</button>' : ""}</div>
    <p class="muted">重试恢复本班执行前的草案和库存，清除本次执行结果，保留成绩、解锁和提示使用记录。</p>
    ${result.passed && current.id === MISSIONS.length ? "<p>8 章首版已完成。费用优化、修复工程和跨班综合挑战将在后续扩展。</p>" : ""}</section>`;
}

function renderPlay(): string {
  const current = mission();
  const analysis = analyze(current, save.routes);
  const step = guideStep(save.guide, current.id);
  const guiding = save.mode === "story" && step !== "dispatch" && !save.result;
  if (guiding && step === "arrival") return `<section class="card dialogue"><p class="eyebrow">山城运输站 · 第 ${current.id} 章</p><h1 id="guide-title">${h(current.title)}</h1>
    <p>${h(current.opening)}</p><p>${current.id === 1 ? "先把这箱补给的路线填进草案，确认执行后，本班结束时到站。"
      : "这一班的草案统一执行，箱子在本班结束时到站。中转不留库存，也不细分行驶时间。"}
    ${current.id >= 7 ? "这次由你独立安排，地图和条件可以随时查。" : "许衡会陪你先试一次，再安排正式运输。"}</p>
    <button class="primary" data-command="advance">接下调度单</button></section>`;
  const editing = !save.result && !(guiding && step === "cut");
  const desk = `<section class="card briefing"><p class="eyebrow">第 ${current.id} 章 · ${h(current.concept)}</p>
    <h1>${h(current.title)}</h1>${guiding ? `<p id="guide-title">${h(guideText(step))}</p>` : `<p>${h(current.opening)}</p>`}
    ${guiding && ["cost", "flow", "residual"].includes(step) ? `<p class="observation">当前草案安排 ${analysis.total} 箱，累计费用 ${analysis.cost} 点。</p>` : ""}
    ${guiding && step === "capacity" ? `<button data-command="capacity-test">试着经北站安排 3 箱</button>${save.guide.observed
      ? `<p class="observation">${h(analyze(current, [{ nodes: ["S", "A", "T"], amount: 3 }]).errors[0])}草案里的箱子不会被丢弃；先拆成两条路线再发出。</p>` : ""}` : ""}
    ${!guiding ? `<div class="requests">${targets(current).map((place) => `<p>${h(place.name)}<strong>${analysis.delivered[place.id]} / ${place.need} 箱</strong></p>`).join("")}
    ${current.id >= 3 ? `<p>总仓已安排<strong>${analysis.total} / ${current.supply} 箱</strong></p>` : ""}
    ${current.id >= 2 ? `<p>草案费用<strong>${analysis.cost} / ${current.budget} 点</strong></p>` : ""}</div>
    ${current.costGoal !== undefined ? `<p>本章要求费用不超过 ${current.costGoal} 点；预算以内的其他方案也可执行并查看结果。</p>` : ""}
    ${current.certificate ? "<p>本章还要提交运输上限证明，选定分界的容量应与交付量相等。</p>" : ""}` : ""}</section>
    <section class="card map-card" aria-label="本班路网">${renderMap(analysis, editing)}
    ${editing ? renderBuilder() : ""}${renderRoutes()}${current.certificate && (!guiding || step === "cut") ? renderCut(analysis) : ""}
    ${analysis.errors.length ? `<ul class="error" role="alert">${analysis.errors.map((text) => `<li>${h(text)}</li>`).join("")}</ul>` : ""}
    ${guiding ? `<div class="guide-progress"><p>引导 ${save.guide.step + 1} / ${guideLength(current.id)}${guideReady(save.guide, current, save.routes, save.side) ? "，观察完成。" : "，先完成眼前的操作。"}</p>
    <button class="primary" data-command="advance" ${guideReady(save.guide, current, save.routes, save.side) ? "" : "disabled"}>继续安排本班运输</button></div>`
      : `${renderConditions(analysis)}<div class="dispatch"><button class="primary" data-command="execute" ${analysis.errors.length || save.result ? "disabled" : ""}>执行本班运输</button>
      <p class="muted">草案满足方向、容量、库存和预算即可执行；是否完成需求与上限证明，在执行后判定。</p></div>`}</section>`;
  return save.result ? `${renderResult()}<details class="card"><summary>查看本章条件与提交草案</summary>${desk}</details>` : desk;
}

function renderManual(): string {
  const id = save.activeId;
  return `<details class="card"><summary>路网手册与实验规则</summary>
    <p>节点是地点，边是连接。箭头限制通行方向。物资是一种可按整箱分配的标准补给，每条路线从总仓出发，到接收点结束。</p>
    ${id >= 2 ? "<p>路线每箱费用等于各路段费用之和。最短路径在这里按费用衡量。地图排版的远近不影响结果，费用都是非负整数。</p>" : ""}
    ${id >= 3 ? "<p>容量是一条通道本班最多能过的箱数，流量是已安排箱数。共享通道合计占用容量。完整路线保证中转站流入量等于流出量，这叫流量守恒。</p>" : ""}
    ${id >= 4 ? "<p>最大流是通道容量和流量守恒允许的最大交付量。库存或经费也可能限制实际任务，它们是额外条件。</p>" : ""}
    ${id >= 5 ? "<p>残量网络包含可增加的正向通道和可撤回的反向调整。撤回只能修改未执行草案；对应路段费用也会扣回。调整路径从总仓到接收点，每次增加交付量。单纯换路线可手动删改。</p>" : ""}
    ${id >= 6 ? "<p>割把地点分成总仓侧与接收点侧。割容量是从总仓侧跨出的原通道容量之和，反方向跨回的通道不计。任何流量都不超过这个上限。最大流等于最小割容量；交付量和一个割容量相等即可证明二者最优。本章证明只针对道路容量，库存、预算需另行满足。</p>" : ""}
    <p>一班统一执行，未模拟车辆、拥堵、逐段时间和中转库存。通道表示临时单向运输额度；费用与容量是教学参数。条件固定，重试便于比较方案。</p>
    <p>当前完成 8 章教学与独立挑战。最小费用流、修复工程、跨班库存及需要 1～2 小时独立规划的综合终关尚未制作。</p></details>`;
}

function render(): void {
  const current = mission();
  root!.innerHTML = `<header class="site-header"><a class="brand" href="../../${testMode ? "?test=1" : ""}">知游 <span>山城补给网</span></a>
    <nav aria-label="补给网菜单"><button data-command="menu" aria-expanded="${menu}">章节与成绩</button>
    <button data-command="mode">${save.mode === "story" ? "进入调度桌" : "回到剧情引导"}</button></nav></header>
    <main id="desk" tabindex="-1">${menu ? `<section class="card chapter-menu"><h2 id="chapters-title">章节与成绩</h2>
    <p>切换或重看会重置当前草案、分界与教程步骤，保留已有成绩和解锁。可以直接体验任意章；第一次游玩建议从第一章开始。</p>
    <button data-command="replay">重看本章剧情</button><div class="chapters">${MISSIONS.map((item) => `<button data-chapter="${item.id}" ${item.id === current.id ? 'aria-current="true"' : ""}>
    <span>${item.id}. ${h(item.title)}</span><small>${save.best[item.id] ? `${save.best[item.id]} 星 · ${save.solo[item.id] ? "独立通过" : "参考通过"}` : item.id <= save.unlocked ? "已解锁" : "可提前体验"}</small></button>`).join("")}</div></section>` : ""}
    ${renderPlay()}<section class="card help"><details ${save.hintLevel ? "open" : ""}><summary>本章提示</summary>
    ${current.hints.slice(0, save.hintLevel).map((hint, i) => `<p>${["思考方向", "关键条件", "参考方案"][i]}：${h(hint)}</p>`).join("")}
    <button data-command="hint" ${save.hintLevel === 3 ? "disabled" : ""}>${["查看思考方向", "查看关键条件", "查看参考方案", "提示已全部展开"][save.hintLevel]}</button>
    <p class="muted">查看提示内容记录为参考提示，星级照常计算。未用提示的通过成绩另外保留。</p></details></section>
    ${renderManual()}<footer><p>${testMode ? "当前使用隔离测试存档。" : "进度自动保存在当前浏览器。"}换设备、换网址或清理站点数据会影响进度。</p>
    ${storageFailed ? '<p class="error" role="alert">浏览器未能保存进度。当前页面仍可游玩，刷新后可能丢失本次草案。</p>' : ""}</footer></main>`;
}

function updateInput(event: Event): void {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || save.result) return;
  if (event.type === "input" && input.type !== "number") return;
  if (input.dataset.cut) {
    save.side = input.checked ? [...save.side, input.dataset.cut] : save.side.filter((id) => id !== input.dataset.cut);
  } else {
    const amount = Number(input.value);
    if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
      if (event.type === "input") { input.setAttribute("aria-invalid", "true"); return; }
      input.removeAttribute("aria-invalid");
      input.value = String(input.dataset.route ? save.routes[Number(input.dataset.route)].amount : save.amount);
      announce("箱数须为 1～100 的整数。");
      return;
    }
    if (input.dataset.route !== undefined) save.routes[Number(input.dataset.route)].amount = amount;
    else save.amount = amount;
  }
  const selector = input.dataset.cut ? `[data-cut="${input.dataset.cut}"]` : input.dataset.route !== undefined ? `[data-route="${input.dataset.route}"]` : "#new-amount";
  persist();
  render();
  root!.querySelector<HTMLElement>(selector)?.focus();
  announce(storageFailed ? "浏览器未能保存，请查看页面底部说明。" : "草案已保存，容量和费用已更新。");
}
root.addEventListener("input", updateInput);
root.addEventListener("change", updateInput);

root.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!button || button.disabled) return;
  const current = mission();
  let focusTarget = "#desk";
  try {
    if (button.dataset.command === "add" || button.dataset.command === "execute") {
      if (root!.querySelector('input[type="number"][aria-invalid="true"]')) throw new Error("箱数须为 1～100 的整数，请先修正标出的输入。");
    }
    if (button.dataset.chapter) { startChapter(save, Number(button.dataset.chapter)); menu = false; }
    else if (button.dataset.remove !== undefined && !save.result) {
      save.routes.splice(Number(button.dataset.remove), 1); save.codes = []; focusTarget = "#routes-title";
    } else if ((button.dataset.node || button.dataset.move) && !save.result) {
      const nodes = walk(current, save.codes)!;
      if (button.dataset.node === current.source) save.codes = [];
      else {
        const move = moves(current, save.routes, save.editing === "residual").find((item) =>
          item.from === nodes.at(-1) && (button.dataset.move ? item.code === button.dataset.move : item.to === button.dataset.node));
        if (!move || nodes.includes(move.to)) throw new Error("这个地点当前不能继续到达。");
        save.codes.push(move.code);
      }
      focusTarget = "#builder-title";
    } else {
      switch (button.dataset.command) {
        case "menu": menu = !menu; focusTarget = menu ? "#chapters-title" : "#desk"; break;
        case "mode": save.mode = save.mode === "story" ? "desk" : "story"; break;
        case "replay": startChapter(save, current.id); save.mode = "story"; menu = false; break;
        case "advance": advanceGuide(save.guide, current, save.routes, save.side); break;
        case "capacity-test": save.guide.observed = true; break;
        case "route-mode": case "residual-mode":
          save.editing = button.dataset.command === "route-mode" ? "route" : "residual"; save.codes = []; focusTarget = "#builder-title"; break;
        case "back": save.codes.pop(); focusTarget = "#builder-title"; break;
        case "clear-path": save.codes = []; focusTarget = "#builder-title"; break;
        case "add": {
          if (save.routes.length >= 64) throw new Error("草案最多保存 64 条路线，请合并或删去已有路线。");
          if (save.editing === "residual") {
            const next = adjust(current, save.routes, save.codes, save.amount);
            save.guide.reversed ||= save.codes.some((code) => code.startsWith("-"));
            save.routes = next;
          } else {
            const route = { nodes: walk(current, save.codes) ?? [], amount: save.amount };
            const error = routeError(current, route);
            if (error) throw new Error(error);
            save.routes.push(route);
          }
          save.codes = []; focusTarget = "#routes-title"; break;
        }
        case "hint": save.hintLevel = Math.min(3, save.hintLevel + 1); save.hinted = true; focusTarget = ".help summary"; break;
        case "execute": save.result = execute(current, save.routes, save.side); recordScore(save); focusTarget = "#result-title"; break;
        case "retry": save.result = null; save.guide.step = guideLength(current.id); save.codes = []; break;
        case "next": startChapter(save, current.id + 1); break;
        default: return;
      }
    }
    persist();
    render();
    const focus = root!.querySelector<HTMLElement>(focusTarget);
    if (focus) { focus.tabIndex = -1; focus.focus(); }
    announce(storageFailed ? "浏览器未能保存，请查看页面底部说明。" : save.result
      ? save.result.passed ? "本班目标完成，成绩已保存。" : "本班还有未满足的目标，可查看回报后调整。" : "草案与引导进度已保存。");
  } catch (error) {
    announce(error instanceof Error ? error.message : "这次操作未能完成。");
  }
});
persist();
render();
