import { escapeHtml as h } from "../../shared/html.js";
import { rememberView } from "../../shared/view-state.js";
import { archiveChapter, resumeChapter } from "../../shared/chapter-drafts.js";
import { backupControls, installBackup } from "../../shared/save-backup.js";
import { adjust, analyze, cutFor, execute, moves, placeName, routeError, targets, walk } from "./engine.js";
import type { Analysis, Mission } from "./engine.js";
import { MISSIONS } from "./missions.js";
import { advanceGuide, guideLength, guideReady, guideStep, guideText, renderHints } from "./story.js";
import { readSave, recordScore, SAVE_KEY, startChapter, writeSave } from "./storage.js";

const root = document.querySelector<HTMLElement>("#app");
const notice = document.querySelector<HTMLElement>("#notice");
if (!root || !notice) throw new Error("缺少补给网页面入口。");
const testMode = new URLSearchParams(location.search).has("test");
const key = testMode ? "mountain-network-test-v1" : SAVE_KEY;
const save = readSave(key);
let menu = false;
let storageFailed = false;
let hintsOpen = save.hintLevel > 0;
let noticeTimer = 0;
let renderedMission = 0;
const mission = (): Mission => MISSIONS[save.activeId - 1];
const pathName = (nodes: readonly string[]): string => nodes.map((id) => placeName(mission(), id)).join(" → ");
const announce = (text: string): void => {
  window.clearTimeout(noticeTimer);
  notice!.textContent = text;
  noticeTimer = window.setTimeout(() => { notice!.textContent = ""; }, 4000);
};
const persist = (): void => { storageFailed = !writeSave(key, save); };

function changeChapter(id: number): void {
  if (id === save.activeId) return;
  save.chapters = archiveChapter(save);
  const restored = resumeChapter(save, id, readSave, { best: save.best, solo: save.solo, unlocked: save.unlocked, mode: save.mode });
  if (restored) Object.assign(save, restored);
  else startChapter(save, id);
}

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
    <path class="hill" d="M0 365 L145 160 L300 355 L430 105 L700 370" />
    <path class="contour" d="M-50 350 Q145 15 325 260 T750 80 M-50 390 Q145 55 325 300 T750 120 M-50 430 Q145 95 325 340 T750 160" />${lines}</svg>
    ${current.places.map((place) => `<button class="map-node ${place.need ? "destination" : ""} ${nodes.includes(place.id) && editing ? "on-path" : ""} ${cut && save.side.includes(place.id) ? "source-side" : ""}"
      style="left:${place.x}%;top:${place.y}%" data-node="${place.id}" ${!editing || save.result || (place.id !== current.source && !next.some((move) => move.to === place.id)) ? "disabled" : ""}
      aria-label="${h(place.name)}${place.need ? `，需要 ${place.need} 箱` : ""}">${h(place.name)}${place.need ? `<small>需 ${place.need} 箱</small>` : ""}</button>`).join("")}</div></div>
    <p class="mobile-map-note">左右滑动查看地图。选路线也可以用下方的通道按钮。</p>
    <div class="map-legend"><span><i class="legend-road"></i>箭头是运输方向</span>
    ${current.id >= 3 ? '<span>箱数：已安排 / 本班容量</span>' : ""}
    ${current.id >= 2 ? '<span>点数：每箱运费</span>' : ""}
    ${editing && save.editing === "residual" ? '<span><i class="legend-road reverse"></i>虚线：撤回原计划的一段安排</span>' : ""}
    ${cut ? '<span><i class="legend-road crossing"></i>橙色：从总仓这组跨出的通道</span>' : ""}</div>`;
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
  return `<section class="panel builder" aria-labelledby="builder-title"><div class="panel-heading"><h2 id="builder-title">${save.editing === "residual" ? "改排已有路线" : "安排一条路线"}</h2><span>${complete ? "已选到接收站" : "从总仓开始选"}</span></div>
    <div class="panel-body">${current.id >= 5 ? `<div class="segmented"><button data-command="route-mode" aria-pressed="${save.editing === "route"}">新增路线</button>
    <button data-command="residual-mode" aria-pressed="${save.editing === "residual"}">改排路线</button></div>` : ""}
    <ol class="path"><li>${h(placeName(current, current.source))}</li>${save.codes.map((code, index) => `<li class="${code.startsWith("-") ? "undo-leg" : ""}">${code.startsWith("-")
      ? `<small>撤回 ${h(placeName(current, nodes[index + 1]))} → ${h(placeName(current, nodes[index]))}</small>` : ""}${h(placeName(current, nodes[index + 1]))}</li>`).join("")}</ol>
    <p class="field-label">${complete ? "路线已选好，填写这次安排的箱数。" : "下一段走哪里？"}</p>
    <div class="choices">${next.map((move) => `<button data-move="${move.code}"><span>${move.reverse
      ? `撤回 ${h(placeName(current, move.to))} → ${h(placeName(current, move.from))}` : `去${h(placeName(current, move.to))}`}</span>
      ${current.id >= 3 ? `<small>最多${move.reverse ? "撤回" : "再运"} ${move.available} 箱</small>` : ""}</button>`).join("")}</div>
    ${!complete && !next.length ? `<p class="error">这里没有能继续走的通道。退回一步换路，或修改下面的运输计划。</p>` : ""}
    ${current.id >= 2 && save.codes.length ? `<div class="route-estimate"><p>每箱${save.editing === "residual" ? fee < 0 ? "减少费用" : "增加费用" : "运费"}<strong>${Math.abs(fee)} <small>点</small></strong></p>
    ${current.id >= 3 ? `<p>沿途最多${save.editing === "residual" ? "调整" : "再运"}<strong>${limit} <small>箱</small></strong></p>` : ""}</div>` : ""}
    <div class="add-route"><label class="quantity" for="new-amount">安排箱数<input id="new-amount" type="number" min="1" max="100" step="1" value="${save.amount}" data-field="amount" /></label>
    <button class="primary" data-command="add" ${complete ? "" : "disabled"}>${save.editing === "residual" ? "确认改排" : "加入运输计划"}</button></div>
    <div class="path-actions"><button class="text-button" data-command="back" ${save.codes.length ? "" : "disabled"}>退回一步</button><button class="text-button" data-command="clear-path" ${save.codes.length ? "" : "disabled"}>重新选路线</button></div>
    <p class="muted">这里只记录路线和箱数。点“执行本班运输”后，才会按计划送货。${save.editing === "residual" ? "每次改排都要从总仓选到接收站，增加预计送达的箱数；只想换一条路线，可以直接删改运输计划。" : ""}</p></div></section>`;
}

function renderRoutes(): string {
  return `<section class="panel routes" aria-labelledby="routes-title"><div class="panel-heading"><h2 id="routes-title">本班运输计划</h2><span>${save.routes.length} 条路线</span></div>
    <div class="panel-body">${save.routes.length ? save.routes.map((route, index) => `<div class="route-row"><span class="route-index">${String(index + 1).padStart(2, "0")}</span><div class="route-copy"><p>${h(pathName(route.nodes))}</p>
    ${mission().id >= 2 ? `<small>每箱 ${route.nodes.slice(1).reduce((sum, to, i) => sum + mission().edges.find((edge) => edge.from === route.nodes[i] && edge.to === to)!.cost, 0)} 点</small>` : ""}</div>
    <label>箱数<input type="number" min="1" max="100" step="1" value="${route.amount}" data-route="${index}" ${save.result ? "disabled" : ""} aria-label="路线 ${index + 1} 的箱数" /></label>
    <button class="text-button" data-remove="${index}" ${save.result ? "disabled" : ""} aria-label="删除路线 ${index + 1}">删除</button></div>`).join("")
      : '<div class="empty-plan"><span aria-hidden="true">○</span><p>还没有安排路线</p><small>选到接收站，填写箱数，再点“加入运输计划”。</small></div>'}</div></section>`;
}

function renderCut(analysis: Analysis): string {
  const current = mission();
  const cut = cutFor(current, save.side);
  return `<section class="cut-box"><h2>证明最多能送多少箱</h2><p>勾选与总仓同组的地点，河岸站留在另一组。从总仓这组跨出的通道在地图上标为橙色，它们的容量之和就是运输上限。</p>
    <fieldset ${save.result ? "disabled" : ""}><legend>与总仓同侧的地点</legend>${current.places.map((place) =>
      `<label><input type="checkbox" data-cut="${place.id}" ${save.side.includes(place.id) ? "checked" : ""} ${place.id === current.source || place.need ? "disabled" : ""} />${h(place.name)}</label>`).join("")}</fieldset>
    <div class="cut-readout"><p>分界容量<strong>${cut?.capacity ?? "未选定"} <small>箱</small></strong></p><span aria-hidden="true">${cut?.capacity === analysis.total && !analysis.errors.length ? "=" : "≠"}</span><p>预计送达<strong>${analysis.total} <small>箱</small></strong></p></div>
    <p class="muted">运输计划符合规则，且送达箱数等于分界容量，就证明达到最大流。</p>
    ${cut ? `<details><summary>查看跨出分界的通道</summary><ul>${cut.edges.map((id) => {
      const edge = current.edges.find((item) => item.id === id)!;
      return `<li>${h(placeName(current, edge.from))} → ${h(placeName(current, edge.to))}：${edge.capacity} 箱</li>`;
    }).join("")}</ul></details>` : ""}</section>`;
}

function renderConditions(analysis: Analysis, id = "conditions"): string {
  const current = mission();
  return `<details class="conditions" id="${id}"><summary>查看通道表与评分条件</summary><p>总仓有 ${current.supply} 箱，预算 ${current.budget} 点。
    ${current.costGoal !== undefined ? `通过本章，费用还要控制在 ${current.costGoal} 点以内。` : ""}满足各接收站需求${current.certificate ? "，并用相等的送达箱数与分界容量证明上限" : ""}，可获 2 星。在此基础上，费用不超过 ${current.efficient} 点可获 3 星。</p>
    <div class="table-wrap"><table><caption>通道的容量、运费与本班安排；地图距离不计费用</caption><thead><tr><th>通道</th><th>本班容量</th><th>每箱运费</th><th>已安排</th><th>剩余容量</th></tr></thead><tbody>
    ${current.edges.map((edge) => `<tr><th>${h(placeName(current, edge.from))} → ${h(placeName(current, edge.to))}</th>
    <td>${edge.capacity} 箱</td><td>${edge.cost} 点</td><td>${analysis.flow[edge.id]} 箱</td><td>${edge.capacity - analysis.flow[edge.id]} 箱</td></tr>`).join("")}</tbody></table></div></details>`;
}

function renderResult(): string {
  const current = mission();
  const result = save.result!;
  return `<section class="panel result ${result.passed ? "success" : "failure"}" aria-labelledby="result-title"><div class="result-heading"><p class="eyebrow">班次结束 · 接收站回报</p>
    <h1 id="result-title">${result.passed ? "这一班，补给送到了" : "这份计划还需要调整"}</h1></div>
    <div class="result-body"><div class="station-replies">${targets(current).map((place) => `<article><div class="reply-heading"><h2>${h(place.name)}</h2><span>收到 ${result.analysis.delivered[place.id]} / ${place.need} 箱</span></div>
    <p>${h(result.analysis.delivered[place.id] >= place.need! ? place.reply : `还缺 ${place.need! - result.analysis.delivered[place.id]} 箱，请重新安排运输。`)}</p></article>`).join("")}</div>
    ${result.failures.length ? `<ul class="error">${result.failures.map((text) => `<li>${h(text)}</li>`).join("")}</ul>`
      : `<p class="earned-score"><strong>${result.stars} 星</strong><span>${save.hinted ? "参考提示通过" : "独立通过"} · 成绩已保存</span></p>`}
    <div class="recap"><span>这次用到的知识</span><p>${h(current.recap)}</p></div>
    <details id="result-details"><summary>查看路线、费用${current.certificate ? "与上限证明" : ""}</summary><p>本班共送达 ${result.analysis.total} 箱，花费 ${result.analysis.cost} 点。
    ${current.certificate ? `分界容量：${result.cut ? `${result.cut.capacity} 箱` : "未选出有效分界"}。` : ""}</p>
    <ul>${save.routes.map((route) => `<li>${h(pathName(route.nodes))}：${route.amount} 箱</li>`).join("")}</ul>${renderConditions(result.analysis, "result-conditions")}</details>
    <div class="actions"><button data-command="retry">修改计划，再试一次</button>
    ${result.passed && current.id < MISSIONS.length ? '<button class="primary" data-command="next">接下一章调度单</button>' : ""}</div>
    <p class="muted">重试时保留刚才的路线和箱数，恢复发货前的库存，清除这次结果。已有成绩、解锁进度和提示记录保留。</p>
    ${result.passed && current.id === MISSIONS.length ? "<p>你完成了目前的 8 章任务。可以回看其他章节，或调整费用较高的计划。最小费用流、道路修复和跨班运输尚未制作。</p>" : ""}
    ${renderHints(current, save.hintLevel, hintsOpen)}</div></section>`;
}

function renderPlay(): string {
  const current = mission();
  const analysis = analyze(current, save.routes);
  const step = guideStep(save.guide, current.id);
  const guiding = save.mode === "story" && step !== "dispatch" && !save.result;
  if (guiding && step === "arrival") return `<section class="arrival"><div class="arrival-copy"><p class="eyebrow">第 ${current.id} 章 · ${current.id >= 7 ? "独立调度" : "山城运输站"}</p><h1 id="guide-title">${h(current.title)}</h1>
    <p class="opening">${h(current.opening)}</p><p class="scene-note">${current.id === 1
      ? "先选路线，再填箱数。许衡会带你安排这箱补给，最后由你确认发货。"
      : current.id >= 7 ? "路线由你决定。下一页可查看各站需求、通道容量和预算。"
      : "先跟许衡试一遍，再安排本班运输。路线和操作进度会自动保存。"}</p>
    <button class="primary" data-command="advance">接下调度单 <span aria-hidden="true">→</span></button></div>
    <div class="arrival-map"><div class="map-heading"><span>本班经过的地点</span><span>总仓 → 接收站</span></div>${renderMap(analysis, false)}</div></section>`;
  const editing = !save.result && !(guiding && step === "cut");
  const ready = guideReady(save.guide, current, save.routes, save.side);
  const desk = `<section class="briefing"><div class="mission-heading"><p class="eyebrow">第 ${current.id} 章 / ${String(MISSIONS.length).padStart(2, "0")}</p><h1>${h(current.title)}</h1>
    <span class="concept">${h(current.concept)}</span></div>
    <div class="briefing-copy">${guiding ? `<p class="speaker">许衡 <span>运输站调度员</span></p><p id="guide-title">${h(guideText(step))}</p>` : `<p>${h(current.opening)}</p>`}
    ${guiding && step === "capacity" ? `<button data-command="capacity-test">试着经北站安排 3 箱</button>${save.guide.observed
      ? `<p class="observation">${h(analyze(current, [{ nodes: ["S", "A", "T"], amount: 3 }]).errors[0])}先把箱数分到两条路线，再确认发货。</p>` : ""}` : ""}</div></section>
    <div class="requests" aria-label="本班需求与计划预览">${targets(current).map((place) => `<div><span>${h(place.name)} · 预计送达</span><strong>${analysis.delivered[place.id]} <small>/ ${place.need} 箱</small></strong></div>`).join("")}
    ${current.id >= 3 ? `<div><span>总仓 · 已安排</span><strong>${analysis.total} <small>/ ${current.supply} 箱</small></strong></div>` : ""}
    ${current.id >= 2 ? `<div class="${analysis.cost > current.budget ? "over-budget" : ""}"><span>计划运费</span><strong>${analysis.cost} <small>/ ${current.budget} 点</small></strong></div>` : ""}
    ${!guiding ? `<div class="goal-note"><span>通过要求</span><p>各站收齐补给${current.costGoal !== undefined ? `，运费不超过 ${current.costGoal} 点` : ""}${current.certificate ? "，送达量等于分界容量" : ""}。</p><small>完成后运费不超过 ${current.efficient} 点，可获 3 星。</small></div>` : ""}</div>
    <div class="workspace"><section class="panel map-panel" aria-labelledby="map-title"><div class="panel-heading"><h2 id="map-title">本班路网</h2><span>${editing ? "点击地点或使用通道按钮选路" : current.certificate ? "橙色通道跨出所选分界" : "查看本班路线"}</span></div>${renderMap(analysis, editing)}</section>
    ${editing ? renderBuilder() : guiding && step === "cut" ? `<div class="panel cut-panel"><div class="panel-body">${renderCut(analysis)}</div></div>` : ""}
    ${renderRoutes()}<section class="panel decision-panel" aria-label="${guiding ? "完成本步操作" : "确认发货"}"><div class="panel-body">
    ${current.certificate && !guiding ? renderCut(analysis) : ""}
    ${analysis.errors.length ? `<ul class="error" role="alert">${analysis.errors.map((text) => `<li>${h(text)}</li>`).join("")}</ul>` : ""}
    ${guiding ? `<div class="guide-progress"><p>引导 ${save.guide.step + 1} / ${guideLength(current.id)} · ${ready ? "这一步完成了" : "先完成上方操作"}</p>
    <button class="primary" data-command="advance" ${ready ? "" : "disabled"}>继续安排本班运输</button></div>`
      : `<div class="dispatch"><h2>确认发货</h2><p>本班按上面的 ${save.routes.length} 条路线统一运输。</p><button class="primary" data-command="execute" ${analysis.errors.length || save.result ? "disabled" : ""}>执行本班运输</button>
      <p class="muted">方向、容量、库存和预算符合规则就能执行。执行后会检查各站是否收齐补给${current.certificate ? "，以及上限证明是否成立" : ""}。</p></div>${renderConditions(analysis)}`}
    ${!save.result ? renderHints(current, save.hintLevel, hintsOpen) : ""}</div></section></div>`;
  return save.result ? `${renderResult()}<details class="submitted" id="submitted"><summary>回看本章条件和已提交的计划</summary>${desk}</details>` : desk;
}

function renderManual(): string {
  const id = save.activeId;
  return `<details class="manual" id="manual"><summary>查阅路网知识与运输规则</summary><div class="manual-body">
    <p>地图上的地点叫“节点”，连接地点的通道叫“边”。每箱都是同一种补给，按整箱分配。路线从总仓出发，到接收站结束，途中不能重复经过同一地点，也不能穿过另一个接收站。</p>
    ${id >= 2 ? "<p>每箱运费是沿途各段费用的总和，再乘箱数，就是这条路线的总运费。例如每箱 3 点，运 2 箱就花 6 点。这里的“最短路径”按费用比较，地图距离不参与计算。各段运费都是大于或等于零的整数。</p>" : ""}
    ${id >= 3 ? "<p>“容量”是一条通道本班最多能运的箱数，“流量”是计划中安排在这段通道上的箱数。多条路线共用通道时要合计检查。中转站收到多少箱就转出多少箱，这叫“流量守恒”。完整路线上的箱数始终相同，保证了进出相等。</p>" : ""}
    ${id >= 4 ? "<p>每段通道不超容量、中转站进出相等时，最多能送到接收站的箱数叫“最大流”。它只说明路网的运输能力；实际发货还要有足够的库存和预算。</p>" : ""}
    ${id >= 5 ? "<p>“残量网络”显示两类选择：顺着原通道增加运输，或撤回原计划中的一段安排。撤回会减少该段已安排的箱数，也会扣除相应运费。反向箭头只表示修改计划，不让箱子倒着运。“改排路线”要选完整的总仓到接收站路径，每次增加预计送达的箱数；单纯换路线可直接删除旧路线，再新增一条。</p>" : ""}
    ${id >= 6 ? "<p>把地点分为总仓所在的一组和接收站所在的一组，两组之间的分界叫“割”。从总仓这一组跨出的原通道容量相加，得到“割容量”；反方向跨回来的通道不计入。所有运输都要跨过分界，所以送达量不可能超过这个和。容量最小的割叫“最小割”。合法方案的送达量等于某个割容量，就同时找到了最大流和最小割。本章证明的是道路容量上限，库存和预算还要分别检查。</p>" : ""}
    <p>点“执行本班运输”会一次完成整份计划，箱子全部按路线到站。游戏不计算每段路要走多久，中转站也不会留下箱子。没有车辆排队、拥堵或运输损耗。通道都是临时单向通道，容量和费用是本游戏设定的数值。</p>
    <p>重试使用相同的地图、库存和预算，方便比较不同方案。目前有 8 章教学和独立任务；最小费用流、道路修复、跨班运输和长篇综合挑战尚未制作。</p></div></details>`;
}

function render(): void {
  const restore = rememberView(root!);
  const current = mission();
  const sameMission = renderedMission === current.id;
  const opened = new Set(sameMission ? [...root!.querySelectorAll<HTMLDetailsElement>("details[id][open]")].map((details) => details.id) : []);
  root!.innerHTML = `<header class="site-header"><a class="brand" href="../../${testMode ? "?test=1" : ""}" aria-label="返回知游游戏目录"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M6 22 16 8l10 14M6 22h20M16 8v14" /><circle cx="6" cy="22" r="3" /><circle cx="16" cy="8" r="3" /><circle cx="26" cy="22" r="3" /></svg></span><span>山城补给网<small>知游 · 图论与网络优化</small></span></a>
    <nav aria-label="补给网菜单"><button data-command="menu" aria-expanded="${menu}">章节与成绩</button>
    <button data-command="mode">${save.mode === "story" ? "自由调度" : "回到剧情引导"}</button></nav></header>
    <main id="desk" tabindex="-1"><div class="chapter-line"><span>山城运输站 <span aria-hidden="true">/</span> 第 ${String(current.id).padStart(2, "0")} 章</span><span>已通过 ${Object.keys(save.best).length} / ${MISSIONS.length} 章</span></div>
    ${menu ? `<section class="panel chapter-menu"><div class="panel-body"><div class="menu-heading"><h2 id="chapters-title">章节与成绩</h2><button class="text-button" data-command="menu">收起章节</button></div>
    <p class="muted">切换章节会保留各章的路线、分界选择和引导步骤。重看剧情只清除本章当前尝试，已有成绩和解锁进度保留。每章都可以提前体验，第一次玩建议从第一章开始。</p>
    <button data-command="replay">重看本章剧情</button><div class="chapters">${MISSIONS.map((item) => `<button data-chapter="${item.id}" ${item.id === current.id ? 'aria-current="true"' : ""}>
    <span class="chapter-number">${String(item.id).padStart(2, "0")}</span><span>${h(item.title)}<small>${save.best[item.id] ? `${save.best[item.id]} 星 · ${save.solo[item.id] ? "独立通过" : "参考提示通过"}` : item.id <= save.unlocked ? "已解锁" : "可提前体验"}</small></span></button>`).join("")}</div></div></section>` : ""}
    ${renderPlay()}<footer>${renderManual()}<p>${testMode ? "当前使用测试存档，不影响正式进度。" : "路线、引导和成绩自动保存在当前浏览器。"}换设备或网址不会同步进度；清理站点数据会删除存档。</p>
    ${storageFailed ? '<p class="error" role="alert">这次未能保存。你仍可继续操作，但刷新或关闭页面可能丢失本次进度。</p>' : ""}${backupControls()}</footer></main>`;
  for (const details of root!.querySelectorAll<HTMLDetailsElement>("details[id]")) if (opened.has(details.id)) details.open = true;
  if (sameMission) restore();
  renderedMission = current.id;
}

function updateInput(event: Event): void {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || save.result) return;
  if (input.type !== "number" && !input.dataset.cut) return;
  if (event.type === "input" && input.type !== "number") return;
  if (input.dataset.cut) {
    save.side = input.checked ? [...save.side, input.dataset.cut] : save.side.filter((id) => id !== input.dataset.cut);
  } else {
    const amount = Number(input.value);
    if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
      if (event.type === "input") { input.setAttribute("aria-invalid", "true"); return; }
      input.removeAttribute("aria-invalid");
      input.value = String(input.dataset.route ? save.routes[Number(input.dataset.route)].amount : save.amount);
      announce("请输入 1 到 100 之间的整数箱数。");
      return;
    }
    if (input.dataset.route !== undefined) save.routes[Number(input.dataset.route)].amount = amount;
    else save.amount = amount;
  }
  const selector = input.dataset.cut ? `[data-cut="${input.dataset.cut}"]` : input.dataset.route !== undefined ? `[data-route="${input.dataset.route}"]` : "#new-amount";
  persist();
  render();
  root!.querySelector<HTMLElement>(selector)?.focus();
  announce(storageFailed ? "这次未能保存，请查看页面底部说明。" : "计划已保存，预计送达量和运费已更新。");
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
      if (root!.querySelector('input[type="number"][aria-invalid="true"]')) throw new Error("请先修改标出的箱数，输入 1 到 100 之间的整数。");
    }
    if (button.dataset.chapter) { changeChapter(Number(button.dataset.chapter)); menu = false; hintsOpen = save.hintLevel > 0; }
    else if (button.dataset.remove !== undefined && !save.result) {
      save.routes.splice(Number(button.dataset.remove), 1); save.codes = []; focusTarget = "#routes-title";
    } else if ((button.dataset.node || button.dataset.move) && !save.result) {
      const nodes = walk(current, save.codes)!;
      if (button.dataset.node === current.source) save.codes = [];
      else {
        const move = moves(current, save.routes, save.editing === "residual").find((item) =>
          item.from === nodes.at(-1) && (button.dataset.move ? item.code === button.dataset.move : item.to === button.dataset.node));
        if (!move || nodes.includes(move.to)) throw new Error("当前地点没有通往这里的可用通道，请选择其他地点。");
        save.codes.push(move.code);
      }
      focusTarget = "#builder-title";
    } else {
      switch (button.dataset.command) {
        case "menu": menu = !menu; focusTarget = menu ? "#chapters-title" : "#desk"; break;
        case "mode": save.mode = save.mode === "story" ? "desk" : "story"; break;
        case "replay": delete save.chapters?.[current.id]; startChapter(save, current.id); save.mode = "story"; menu = false; hintsOpen = false; break;
        case "advance": advanceGuide(save.guide, current, save.routes, save.side); break;
        case "capacity-test": save.guide.observed = true; break;
        case "route-mode": case "residual-mode":
          save.editing = button.dataset.command === "route-mode" ? "route" : "residual"; save.codes = []; focusTarget = "#builder-title"; break;
        case "back": save.codes.pop(); focusTarget = "#builder-title"; break;
        case "clear-path": save.codes = []; focusTarget = "#builder-title"; break;
        case "add": {
          if (save.routes.length >= 64) throw new Error("最多能安排 64 条路线，请先删除多余路线。相同路线可以合并箱数。");
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
        case "hint-toggle":
          hintsOpen = !hintsOpen;
          if (hintsOpen && save.hintLevel === 0) { save.hintLevel = 1; save.hinted = true; }
          focusTarget = hintsOpen ? "#hint-content" : '[data-command="hint-toggle"]'; break;
        case "hint-next":
          save.hintLevel = Math.min(3, save.hintLevel + 1); save.hinted = true; hintsOpen = true; focusTarget = "#hint-content"; break;
        case "execute": save.result = execute(current, save.routes, save.side); recordScore(save); focusTarget = "#result-title"; break;
        case "retry": save.result = null; save.guide.step = guideLength(current.id); save.codes = []; break;
        case "next": changeChapter(current.id + 1); hintsOpen = save.hintLevel > 0; break;
        default: return;
      }
    }
    persist();
    render();
    const focus = root!.querySelector<HTMLElement>(focusTarget);
    if (focus) { if (!(focus instanceof HTMLButtonElement)) focus.tabIndex = -1; focus.focus({ preventScroll: ["#builder-title", "#routes-title", "#hint-content"].includes(focusTarget) }); }
    announce(storageFailed ? "这次未能保存，请查看页面底部说明。" : save.result
      ? save.result.passed ? "本班目标完成，成绩已保存。" : "这份计划还有目标未完成，请查看接收站回报。" : "运输计划和引导进度已保存。");
  } catch (error) {
    announce(error instanceof Error ? error.message : "这次操作未能完成。");
  }
});
persist();
render();
installBackup(root, "network", readSave, () => save, (next) => {
  Object.assign(save, next); menu = false; hintsOpen = save.hintLevel > 0; persist(); render();
}, announce);
