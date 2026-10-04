import { escapeHtml as h } from "../../shared/html.js";
import { rememberView } from "../../shared/view-state.js";
import { archiveChapter, resumeChapter } from "../../shared/chapter-drafts.js";
import { backupControls, installBackup } from "../../shared/save-backup.js";
import { actionName, analyze, execute, missionError } from "./engine.js";
import type { Action, Case, Plan } from "./engine.js";
import { MISSIONS } from "./missions.js";
import { advanceGuide, batchExplanation, branchTable, detectorExplanation, fmt, guideAction, guideLength, guideStep, pct, renderGuide, renderHints } from "./story.js";
import { renderResult } from "./results.js";
import { readSave, recordScore, SAVE_KEY, startChapter, writeSave } from "./storage.js";

const root = document.querySelector<HTMLElement>("#app");
const notice = document.querySelector<HTMLElement>("#notice");
if (!root || !notice) throw new Error("缺少检修站页面入口。");
const testMode = new URLSearchParams(location.search).has("test");
const key = testMode ? "repair-station-test-v1" : SAVE_KEY;
const save = readSave(key);
let menu = false;
let storageFailed = false;
let hintsOpen = save.hintLevel > 0;
let renderedContext = "";
const mission = () => MISSIONS[save.activeId - 1];

function persist(): void { storageFailed = !writeSave(key, save); }
function announce(text: string): void { notice!.textContent = text; }
function changeChapter(id: number): void {
  if (id === save.activeId) return;
  save.chapters = archiveChapter(save);
  const restored = resumeChapter(save, id, readSave, { best: save.best, solo: save.solo, unlocked: save.unlocked, mode: save.mode });
  if (restored) Object.assign(save, restored);
  else startChapter(save, id);
}
function actionSelect(index: number, field: "red" | "green", value: Action, label: string): string {
  return `<label>${h(label)}<select data-case="${index}" data-field="${field}" ${save.result ? "disabled" : ""}>
    ${(["keep", "replace"] as const).map((action) => `<option value="${action}" ${action === value ? "selected" : ""}>${actionName(action)}</option>`).join("")}</select></label>`;
}
function renderCase(job: Case, index: number): string {
  const plan = save.plans[index];
  const analysis = analyze(job, plan);
  const locked = save.result ? "disabled" : "";
  let controls: string;
  let facts: string;
  if (job.kind === "device") {
    facts = detectorExplanation(job) + (job.evidence.length ? `<ul class="reports">${job.evidence.map((report) =>
      `<li><span>${h(report.title)} · ${h(report.source)}</span><strong>${report.red ? "标红" : "未标红"}</strong><small>检出率 ${pct(report.detector.sensitivity)} · 误报率 ${pct(report.detector.falseAlarm)}</small></li>`).join("")}</ul>` : "<p class=\"muted\">这台设备还没有检测报告。</p>")
      + `<p class="observation"><span>${job.evidence.length ? "看过现有报告后的判断" : "检测前的判断"}</span><strong>故障概率 ${pct(analysis.fault)}</strong></p>`;
    controls = `${job.detectors.length > 1 ? `<details data-panel="tools-${index}"><summary>比较检测器的效果与费用</summary><ul>${job.detectors.map((detector) =>
      `<li>${h(detector.name)}：检出率 ${pct(detector.sensitivity)}，误报率 ${pct(detector.falseAlarm)}，费用 ${detector.cost} 点，占 ${detector.work} 格工时。</li>`).join("")}</ul></details>` : ""}
      <label>用什么检测<select data-case="${index}" data-field="detectorId" ${locked}><option value="">不追加检测</option>
      ${job.detectors.map((detector) => `<option value="${h(detector.id)}" ${plan.detectorId === detector.id ? "selected" : ""}>${h(detector.name)} · ${detector.cost} 点 / ${detector.work} 格工时</option>`).join("")}</select></label>`;
    if (plan.detectorId) {
      const detector = job.detectors.find((item) => item.id === plan.detectorId)!;
      controls += `<p class="detector-note">检出率 ${pct(detector.sensitivity)} · 误报率 ${pct(detector.falseAlarm)}</p><div class="form-row">
        ${actionSelect(index, "red", plan.red, "如果检测标红")}${actionSelect(index, "green", plan.green, "如果检测未标红")}</div>`;
    } else controls += actionSelect(index, "red", plan.red, "直接怎么处理");
  } else {
    facts = batchExplanation(job) + `<p class="observation"><span>检查样品前的判断</span><strong>平均故障率 ${pct(analysis.fault)}</strong></p>`;
    controls = `<div class="form-row"><label>检查几件样品<select data-case="${index}" data-field="samples" ${locked}>
      ${Array.from({ length: job.maxSamples + 1 }, (_, n) => `<option value="${n}" ${plan.samples === n ? "selected" : ""}>${n} 件 · ${n * job.sampleCost} 点 / ${n} 格工时</option>`).join("")}</select></label>
      <label>更换整批的条件<select data-case="${index}" data-field="cutoff" ${locked}>
      ${Array.from({ length: plan.samples + 2 }, (_, n) => `<option value="${n}" ${plan.cutoff === n ? "selected" : ""}>${n === 0 ? "总是更换" : n > plan.samples ? "总是保留" : `至少查出 ${n} 件坏样品`}</option>`).join("")}</select></label></div>
      <p>先填好更换条件，执行后根据查出的坏件数，自动更换或保留全部 ${job.count} 件待用设备。</p>`;
  }
  return `<article class="card job" id="job-${index}"><div class="job-heading"><span class="job-number">${String(index + 1).padStart(2, "0")}</span><div><p class="eyebrow">${h(job.requester)}的检修单</p>
    <h2>${h(job.title)}</h2></div><span class="job-kind">${job.kind === "batch" ? "批次取样" : "单台检修"}</span></div><p class="request">${h(job.request)}</p>
    <div class="job-body"><section class="job-facts" aria-label="${h(job.title)}的资料"><h3>已有资料</h3>${facts}
    <dl class="cost-facts"><div><dt>更换 1 件</dt><dd>${job.replaceCost} 点</dd></div><div><dt>留下 1 件坏设备</dt><dd>损失 ${job.faultLoss} 点</dd></div></dl>
    <p class="muted">更换能消除本次故障；保留好设备不会产生故障损失。</p></section>
    <section class="plan-box" aria-label="${h(job.title)}的方案"><h3>你的检修方案</h3>${controls}<div class="plan-total"><span>这份单的平均损失</span><strong>${fmt(analysis.expected)}<small> 点</small></strong></div>
    <details data-panel="calculation-${index}"><summary>这笔平均损失怎么算？</summary>${branchTable(job, plan)}
    ${job.kind === "batch" ? `<ul>${analysis.branches.map((branch) => `<li>${h(branch.label)}时，生产线处于故障率 ${job.rates.map(pct).join("、")} 三种状态的概率，分别为 ${branch.weights.map(pct).join("、")}。</li>`).join("")}</ul>` : ""}
    </details></section></div></article>`;
}
function renderDesk(): string {
  const current = mission();
  const analyses = current.cases.map((job, i) => analyze(job, save.plans[i]));
  const cost = analyses.reduce((sum, item) => sum + item.cost, 0);
  const work = analyses.reduce((sum, item) => sum + item.work, 0);
  const expected = analyses.reduce((sum, item) => sum + item.expected, 0);
  const invalid = missionError(current, save.plans);
  const desk = `<section class="card briefing"><p class="eyebrow">${h(current.concept)}</p><h1>第 ${current.id} 章 · ${h(current.title)}</h1>
    <p>${h(current.opening)}</p><div class="chapter-goals"><span>调查预算 ${current.budget} 点 · 工时 ${current.work} 格</span><span>通关：平均损失不超过 ${current.goal} 点</span><span>3 星：不超过 ${current.efficient} 点</span></div>
    <p class="scoring-note">平均损失，也叫“期望损失”：按这套方案处理许多次同类任务，平均每次会损失多少。它会算进所有可能的检测结果，通关和星级都用这个数判断。</p>
    <p class="unit-note">“点”用来统一计算检测费、更换费和故障损失。1 格工时代表一份检查工作量，游戏里不用等待。</p>
    <details data-panel="rules"><summary>费用、工时和检测规则</summary><p>用“点”统一计算检测费、更换费和故障损失。${current.cases.length > 1 ? "各份单共用" : "本章可用"} ${current.budget} 点调查预算、${current.work} 格工时。预算只限制检测与取样，更换费也计入平均损失。</p>
    <p>1 格工时代表一份检查工作量，执行时不需要等待。单台设备最多追加一次检测。检测器标红表示报告异常，可能误报；未标红也可能漏掉故障。</p>
    <p>每份单都要填好方案。工具自动计算概率和平均损失，你决定怎么检查和处理。预算、工时够用就能执行；平均损失较高的方案也可以试，再看哪里需要调整。</p></details></section>
    ${!save.result && current.cases.length > 1 ? `<div class="planning-status" aria-label="整套方案当前合计"><span>调查 ${fmt(cost)} / ${current.budget} 点 · ${work} / ${current.work} 格<br>平均损失 ${fmt(expected)} / ${current.goal} 点</span><a href="#dispatch">核对整套方案 ↓</a></div>` : ""}
    ${current.cases.length > 3 ? `<details data-panel="overview"><summary>对照整班的调查安排</summary><div class="table-wrap" tabindex="0" role="region" aria-label="整班调查安排，可横向滚动"><table><caption>点击检修单名称，回到对应资料与方案</caption><thead><tr><th>检修单</th><th>当前调查</th><th>调查费</th><th>工时</th><th>平均损失</th></tr></thead><tbody>
    ${current.cases.map((job, i) => `<tr><th><a href="#job-${i}">${h(job.title)}</a></th><td>${job.kind === "device" ? h(job.detectors.find(item => item.id === save.plans[i].detectorId)?.name ?? "不追加检测") : `${save.plans[i].samples} 件样品`}</td><td>${fmt(analyses[i].cost)} 点</td><td>${analyses[i].work} 格</td><td>${fmt(analyses[i].expected)} 点</td></tr>`).join("")}
    </tbody></table></div></details>` : ""}
    <div class="job-grid">${current.cases.map(renderCase).join("")}</div>
    <section class="card dispatch" id="dispatch" tabindex="-1" aria-label="执行整套方案"><div class="metrics"><p>调查费 <strong>${fmt(cost)} / ${current.budget} 点</strong></p>
    <p>调查工时 <strong>${work} / ${current.work} 格</strong></p><p>全部检修单的平均损失 <strong>${fmt(expected)} 点</strong></p></div>
    ${invalid ? `<p class="error" role="alert">${h(invalid)}</p>` : ""}<button class="primary" data-command="execute" ${invalid || save.result ? "disabled" : ""}>执行所有检修单</button>
    <p class="muted">执行后会揭晓检测结果，按你填好的条件更换或保留设备，并列出这次账单。</p></section>`;
  return save.result ? `${renderResult(current, save.plans, save.result, save.hinted, current.id === MISSIONS.length)}<details class="submitted" data-panel="submitted"><summary>查看本章资料与提交的方案</summary>${desk}</details>` : desk;
}
function renderMenu(): string {
  return `<section class="card chapter-menu" aria-labelledby="chapters-title"><h2 id="chapters-title">选择章节</h2>
    <p>切换章节会保留各章的方案和引导步骤。重看剧情只清空本章当前尝试，成绩和解锁进度保留。重新处理同一章时，设备和检测结果不变。可以提前体验其他章，第一次玩建议从第 1 章开始。</p>
    <button data-command="replay">重看本章剧情</button>
    <div class="chapters">${MISSIONS.map((item) => `<button data-chapter="${item.id}" ${item.id === save.activeId ? 'aria-current="true"' : ""}>
    <span>${item.id}. ${h(item.title)}</span><small>${save.best[item.id] ? `最好 ${save.best[item.id]} 星${save.solo[item.id] ? ` · 独立 ${save.solo[item.id]} 星` : " · 使用过提示"}` : item.id <= save.unlocked ? "已解锁" : "可提前体验"}</small></button>`).join("")}</div></section>`;
}
function renderManual(): string {
  return `<details class="manual" data-panel="manual"><summary>检修手册<span>概念与计算规则</span></summary><div class="manual-content">
    <h2>看到检测结果后，怎样判断故障概率？</h2>
    <p>概率表示同类情况出现的可能性。20% 相当于每 100 次同类情况平均约有 20 次，单独一组不一定正好占 20%。只在符合某个条件的对象中计算概率，叫“条件概率”，例如只看标红的灯，算其中坏灯的比例。</p>
    <p>检出率是坏设备被标红的概率；误报率是好设备被标红的概率。新检测前的判断叫“先验”，看到结果后的判断叫“后验”。把已有判断和新检测效果结合起来计算，叫“贝叶斯更新”。</p>
    <p>计算时用 p 表示原有故障概率，s 表示检出率，f 表示误报率。它们都在 0 到 1 之间：2% 写成 0.02，90% 写成 0.9。</p>
    <p class="formula">标红后的故障概率 = p × s ÷ [p × s + (1 − p) × f]</p>
    <p>例如 p = 0.02、s = 0.9、f = 0.05。坏设备且标红的比例是 0.018，好设备且误标红的比例是 0.049，所以标红后故障概率为 0.018 ÷ 0.067 ≈ 26.87%。未标红时，公式中的 s、f 分别换成 1 − s、1 − f。</p>
    <h2>平均损失和这次账单有什么区别？</h2>
    <p>平均损失也叫“期望损失”，表示按同一方案反复处理同类任务时，平均每次损失多少。把每种可能结果的“出现概率 × 处理后的平均损失”相加，再加调查费，得到评分用的平均损失。</p>
    <p>例如保留一台故障概率 20% 的灯，坏了损失 30 点，平均损失就是 20% × 30 = 6 点。实际处理一台，好灯的故障损失是 0 点，坏灯是 30 点，不会真的每台都损失 6 点。</p>
    <p>保留设备的平均故障损失 = 件数 × 故障概率 × 每件故障损失；更换费用 = 件数 × 每件更换费。预算只限制检测与取样，评分还会计入更换费和故障损失。“点”和“格工时”是游戏用的计量单位，不代表现实报价或等待时间。</p>
    <h2>样品能告诉我们什么？</h2>
    <p>模型只考虑表中三种生产状态。检查样品后，每种状态的新概率这样算：原来的状态概率 × 该状态下查出这些坏件的概率，再除以三种结果之和，让新概率合计为 100%。</p>
    <p>把每种状态的新概率乘它的故障率，再相加，得到待用设备的平均故障率。样品少时，即使全部正常，也不能断定这批没有坏件。</p>
    <h2>模型作了哪些简化？</h2>
    <p>样品是同一生产状态下额外制备的，不减少待用件数，检查能准确判断好坏。固定生产状态后，各件设备的好坏互不影响。单台设备实际好坏固定后，各次检测独立工作，同一次检测的报告只用一次。这些都是“条件独立”的假设，现实中未必成立。</p>
    <p>更换能消除本次故障，模型没有加入后续老化或维修失败。同一章的实际设备状态和检测结果固定，重试、刷新或改变操作顺序都不会重新抽取。</p>
    <p>第 1～7 章学习检测和取样，第 8～12 章独立比较报告与处理门槛，第 13～18 章安排共享调查资源，第 19～24 章完成街区综合值班。可从章节菜单重看或继续任意一章。</p></div></details>`;
}
function render(): void {
  const restore = rememberView(root!);
  const current = mission();
  const inGuide = save.mode === "story" && guideStep(save.guide, current.id) !== "dispatch" && !save.result;
  const context = `${current.id}:${inGuide}:${!!save.result}`;
  const sameContext = context === renderedContext;
  const openPanels = sameContext ? [...root!.querySelectorAll<HTMLDetailsElement>("details[data-panel][open]")].map((panel) => panel.dataset.panel) : [];
  renderedContext = context;
  root!.innerHTML = `<header class="site-header"><a href="../../${testMode ? "?test=1" : ""}" class="brand"><span class="brand-mark" aria-hidden="true">修</span><span>街区检修站<small>知游 · 概率与统计推断</small></span></a>
    <nav aria-label="检修站菜单"><button data-command="menu" aria-expanded="${menu}">章节与成绩</button><button data-command="mode">${save.mode === "story" ? "进入检修桌" : "回到剧情引导"}</button></nav></header>
    <main id="desk" tabindex="-1"><div class="chapter-strip"><span>检修记录 <strong>${String(current.id).padStart(2, "0")} / ${String(MISSIONS.length).padStart(2, "0")}</strong></span><span>${inGuide ? "剧情引导" : save.result ? "检修结算" : "检修桌"} · ${Object.keys(save.best).length} 章已通过</span></div>
    ${menu ? renderMenu() : ""}${inGuide ? renderGuide(save.guide, current) : renderDesk()}
    <div class="reference-tools">${inGuide ? "" : renderHints(current, save.hintLevel, hintsOpen)}${renderManual()}</div>
    <footer><p>${testMode ? "当前使用测试档案，与正式进度分开保存。" : "进度自动保存在当前浏览器。"}换设备或换网址后，这里的进度不会跟过去；清理站点数据会删除存档。</p>
    ${storageFailed ? '<p class="error" role="alert">浏览器未能保存。当前页面仍可游玩，刷新后可能丢失本次进度。</p>' : ""}${backupControls()}</footer></main>`;
  for (const panel of root!.querySelectorAll<HTMLDetailsElement>("details[data-panel]")) if (openPanels.includes(panel.dataset.panel)) panel.open = true;
  if (sameContext) restore();
}
root.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement) || save.result) return;
  const index = Number(target.dataset.case);
  const field = target.dataset.field as keyof Plan;
  if (!Number.isInteger(index) || !save.plans[index] || !["detectorId", "red", "green", "samples", "cutoff"].includes(field)) return;
  const plan = save.plans[index];
  if (field === "samples") {
    plan.samples = Number(target.value);
    plan.cutoff = Math.min(plan.cutoff, plan.samples + 1);
  } else if (field === "cutoff") plan.cutoff = Number(target.value);
  else if (field === "detectorId") plan.detectorId = target.value;
  else plan[field] = target.value as Action;
  persist();
  render();
  announce(storageFailed ? "损失计算已更新，但浏览器没有保存成功。" : "方案已保存，损失计算已更新。");
});
root.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!button || button.disabled) return;
  const current = mission();
  let focusTarget = "#desk";
  try {
    if (button.dataset.chapter) { changeChapter(Number(button.dataset.chapter)); menu = false; hintsOpen = save.hintLevel > 0; }
    else if (button.dataset.guide) {
      guideAction(save.guide, current.id, button.dataset.guide);
      focusTarget = `[data-guide="${button.dataset.guide}"]`;
    } else {
      switch (button.dataset.command) {
        case "menu": menu = !menu; focusTarget = menu ? "#chapters-title" : "#desk"; break;
        case "mode": save.mode = save.mode === "story" ? "desk" : "story"; break;
        case "replay": delete save.chapters?.[current.id]; startChapter(save, current.id); save.mode = "story"; menu = false; hintsOpen = false; break;
        case "advance": advanceGuide(save.guide, current.id); focusTarget = guideStep(save.guide, current.id) === "dispatch" ? "#desk" : "#guide-title"; break;
        case "hint":
          hintsOpen = !hintsOpen;
          if (hintsOpen && save.hintLevel === 0) { save.hintLevel = 1; save.hinted = true; }
          focusTarget = ".help-toggle";
          break;
        case "hint-next": save.hintLevel = Math.min(3, save.hintLevel + 1); save.hinted = true; focusTarget = "#chapter-hints"; break;
        case "execute":
          save.result = execute(current, save.plans);
          recordScore(save);
          focusTarget = "#result-title";
          break;
        case "retry": save.result = null; save.guide.step = guideLength(current.id); break;
        case "next": changeChapter(current.id + 1); hintsOpen = save.hintLevel > 0; break;
        default: return;
      }
    }
    persist();
    render();
    const target = root!.querySelector<HTMLElement>(focusTarget);
    if (target) { if (!(target instanceof HTMLButtonElement)) target.tabIndex = -1; target.focus(); }
    announce(storageFailed ? "浏览器未能保存进度，请查看页面底部说明。" : save.result
      ? `评分用的平均损失 ${fmt(save.result.expected)} 点，${save.result.passed ? "通过本章" : "还需调整"}。` : "进度已保存。");
  } catch (caught) {
    announce(caught instanceof Error ? caught.message : "这次操作未能完成。");
  }
});
persist();
render();
installBackup(root, "probability", readSave, () => save, (next) => {
  Object.assign(save, next); menu = false; hintsOpen = save.hintLevel > 0; persist(); render();
}, announce);
