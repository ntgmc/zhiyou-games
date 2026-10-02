import { escapeHtml as h } from "../../shared/html.js";
import { actionName, analyze, execute, missionError } from "./engine.js";
import type { Action, Case, Plan } from "./engine.js";
import { MISSIONS } from "./missions.js";
import { advanceGuide, batchExplanation, branchTable, detectorExplanation, fmt, guideAction, guideLength, guideStep, pct, renderGuide } from "./story.js";
import { readSave, recordScore, SAVE_KEY, startChapter, writeSave } from "./storage.js";

const root = document.querySelector<HTMLElement>("#app");
const notice = document.querySelector<HTMLElement>("#notice");
if (!root || !notice) throw new Error("缺少检修站页面入口。");
const testMode = new URLSearchParams(location.search).has("test");
const key = testMode ? "repair-station-test-v1" : SAVE_KEY;
const save = readSave(key);
let menu = false;
let storageFailed = false;
const mission = () => MISSIONS[save.activeId - 1];

function persist(): void { storageFailed = !writeSave(key, save); }
function announce(text: string): void { notice!.textContent = text; }
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
      `<li>${h(report.title)} · ${h(report.source)} · ${report.red ? "标红" : "未标红"}（故障检出 ${pct(report.detector.sensitivity)}，正常误报 ${pct(report.detector.falseAlarm)}）</li>`).join("")}</ul>` : "<p>目前没有检测报告。</p>")
      + `<p class="observation">计入已有证据后，当前故障概率 ${pct(analysis.fault)}。</p>`;
    controls = `${job.detectors.length > 1 ? `<details><summary>查看所有工具的校准记录</summary><ul>${job.detectors.map((detector) =>
      `<li>${h(detector.name)}：检出 ${pct(detector.sensitivity)}，误报 ${pct(detector.falseAlarm)}，${detector.cost} 点 / ${detector.work} 格工时。</li>`).join("")}</ul></details>` : ""}
      <label>调查工具<select data-case="${index}" data-field="detectorId" ${locked}><option value="">不追加检测</option>
      ${job.detectors.map((detector) => `<option value="${h(detector.id)}" ${plan.detectorId === detector.id ? "selected" : ""}>${h(detector.name)} · ${detector.cost} 点 / ${detector.work} 格工时</option>`).join("")}</select></label>`;
    if (plan.detectorId) {
      const detector = job.detectors.find((item) => item.id === plan.detectorId)!;
      controls += `<p>${h(detector.name)}：故障检出 ${pct(detector.sensitivity)}，正常误报 ${pct(detector.falseAlarm)}。</p><div class="form-row">
        ${actionSelect(index, "red", plan.red, "如果检测标红")}${actionSelect(index, "green", plan.green, "如果检测未标红")}</div>`;
    } else controls += actionSelect(index, "red", plan.red, "直接处置");
  } else {
    facts = batchExplanation(job) + `<p class="observation">调查前的平均故障率 ${pct(analysis.fault)}，尚未看到正式样品结果。</p>`;
    controls = `<div class="form-row"><label>调查样品数<select data-case="${index}" data-field="samples" ${locked}>
      ${Array.from({ length: job.maxSamples + 1 }, (_, n) => `<option value="${n}" ${plan.samples === n ? "selected" : ""}>${n} 件 · ${n * job.sampleCost} 点 / ${n} 格工时</option>`).join("")}</select></label>
      <label>更换整批的条件<select data-case="${index}" data-field="cutoff" ${locked}>
      ${Array.from({ length: plan.samples + 2 }, (_, n) => `<option value="${n}" ${plan.cutoff === n ? "selected" : ""}>${n === 0 ? "总是更换" : n > plan.samples ? "总是保留" : `至少查出 ${n} 件坏样品`}</option>`).join("")}</select></label></div>
      <p>执行前安排所有可能结果的处置。取样完成后自动按这份条件执行，更换或保留全部 ${job.count} 件待用设备。</p>`;
  }
  return `<article class="card job"><div class="job-heading"><span class="job-number">${String(index + 1).padStart(2, "0")}</span><div><p class="eyebrow">${h(job.requester)}的检修单</p>
    <h2>${h(job.title)}</h2></div></div><p>${h(job.request)}</p>${facts}
    <p>每件更换 ${job.replaceCost} 点；每件故障被保留会损失 ${job.faultLoss} 点。更换后本次故障风险消除。</p>
    <div class="plan-box"><h3>安排调查与处置</h3>${controls}<p class="plan-total">这份方案期望总损失 <strong>${fmt(analysis.expected)} 点</strong></p>
    <details><summary>查看分支概率与计算</summary>${branchTable(job, plan)}
    ${job.kind === "batch" ? `<ul>${analysis.branches.map((branch) => `<li>${h(branch.label)}：对 ${job.rates.map(pct).join(" / ")} 三种生产状态的后验支持分别为 ${branch.weights.map(pct).join(" / ")}。</li>`).join("")}</ul>` : ""}
    </details></div></article>`;
}
function renderResult(): string {
  const result = save.result!;
  const current = mission();
  const analyses = current.cases.map((job, i) => analyze(job, save.plans[i]));
  const largest = analyses.reduce((best, item, i) => item.expected > analyses[best].expected ? i : best, 0);
  const largestBranch = analyses[largest].branches.reduce((best, branch) => branch.chance * branch.loss > best.chance * best.loss ? branch : best);
  const responses = result.outcomes.map((outcome, index) => {
    const job = current.cases[index];
    const count = job.kind === "batch" ? job.count : 1;
    const returnedFaults = outcome.action === "keep" ? outcome.faults : 0;
    const reply = returnedFaults ? `${returnedFaults} 件保留设备后来出现故障，已记入这次实际损失。`
      : outcome.action === "replace" ? `${count} 件设备已经更换，报修者收到了可用的设备。` : `${count} 件设备保留使用，这次没有出现故障。`;
    return `<li><strong>${h(job.title)}</strong>：${h(reply)}</li>`;
  }).join("");
  return `<section class="card result ${result.passed ? "success" : "failure"}" aria-labelledby="result-title">
    <p class="eyebrow">设备已经交回 · 值班记录</p><h2 id="result-title">${result.passed ? "方案达到本章目标" : "这份方案还需要调整"}</h2><ul>${responses}</ul>
    <p class="recap">${h(current.recap)}</p><p>方案期望损失 ${fmt(result.expected)} 点，目标不超过 ${current.goal} 点。
    ${result.passed ? `本次 ${result.stars} 星，${save.hinted ? "参考提示通过" : "独立通过"}。` : `超出 ${fmt(result.expected - current.goal)} 点，打开分支计算可检查原因。`}</p>
    ${result.passed ? "" : `<p>“${h(current.cases[largest].title)}”的预计损失最高：调查费 ${fmt(analyses[largest].cost)} 点，处置期望损失 ${fmt(analyses[largest].expected - analyses[largest].cost)} 点。
    其中“${h(largestBranch.label)}”分支安排${actionName(largestBranch.action)}，出现概率 ${pct(largestBranch.chance)} × 处置期望损失 ${fmt(largestBranch.loss)} 点，贡献约 ${fmt(largestBranch.chance * largestBranch.loss)} 点。可在这份单的分支计算中核对。</p>`}
    <p>这一次实际损失 ${fmt(result.actual)} 点，单次结果不决定方案成绩。</p>
    <details><summary>查看执行记录和本次实际状态</summary><div class="table-wrap"><table><thead><tr><th>检修单</th><th>调查结果</th><th>结果后的故障概率</th><th>处置</th><th>处置前真实故障数</th><th>实际总损失</th></tr></thead><tbody>
    ${result.outcomes.map((outcome, index) => `<tr><th>${h(current.cases[index].title)}</th><td>${h(outcome.observation)}</td><td>${pct(outcome.posterior)}</td><td>${actionName(outcome.action)}</td><td>${outcome.faults}</td><td>${fmt(outcome.actual)} 点</td></tr>`).join("")}
    </tbody></table></div><p>真实状态在处置后用于教学复盘；处置前只能获得模型条件和调查证据。正式状态与检测结果固定，重试不会重新抽取。</p></details>
    <div class="actions"><button data-command="retry">调整本章方案</button>
    ${result.passed && current.id < MISSIONS.length ? '<button class="primary" data-command="next">接下一章检修单</button>' : ""}
    ${result.passed && current.id === MISSIONS.length ? '<p>8 章首版已完成。后续抽样偏差、对照实验和长篇综合挑战尚未制作。</p>' : ""}</div>
    <p class="muted">调整会清除本次执行结果，保留配置、已有成绩、解锁和提示使用记录。</p></section>`;
}
function renderDesk(): string {
  const current = mission();
  const analyses = current.cases.map((job, i) => analyze(job, save.plans[i]));
  const cost = analyses.reduce((sum, item) => sum + item.cost, 0);
  const work = analyses.reduce((sum, item) => sum + item.work, 0);
  const expected = analyses.reduce((sum, item) => sum + item.expected, 0);
  const invalid = missionError(current, save.plans);
  const desk = `<section class="card briefing"><p class="eyebrow">${h(current.concept)}</p><h1>第 ${current.id} 章 · ${h(current.title)}</h1>
    <p>${h(current.opening)}</p><p>每份检修单都要安排。调查预算 ${current.budget} 点、工时 ${current.work} 格，期望总损失不超过 ${current.goal} 点为通过，不超过 ${current.efficient} 点为 3 星。</p>
    <p>“点”是统一的损失单位，包含调查费用、更换材料和留下故障的后果。调查预算只限制检测与取样支出；更换费用计入损失目标。一格工时代表一份检查工作量，执行立即完成，没有等待计时。</p>
    <p>“期望”表示同类情况反复发生时的平均结果。工具自动计算分支概率；选工具、安排处置和分配资源由你决定。合法方案即使预计损失较高，也可以执行并复盘。</p>
    ${current.id <= 3 ? "<p>单台设备最多追加一次检测。标红表示检测器报告异常，未标红也可能漏掉故障。百分比是每 100 次同类情况中的平均占比。</p>" : ""}</section>
    <div class="job-grid">${current.cases.map(renderCase).join("")}</div>
    <section class="card dispatch" aria-label="执行整套方案"><div class="metrics"><p>调查费 <strong>${fmt(cost)} / ${current.budget} 点</strong></p>
    <p>调查工时 <strong>${work} / ${current.work} 格</strong></p><p>全程期望损失 <strong>${fmt(expected)} 点</strong></p></div>
    ${invalid ? `<p class="error" role="alert">${h(invalid)}</p>` : ""}<button class="primary" data-command="execute" ${invalid || save.result ? "disabled" : ""}>执行所有检修单</button>
    <p class="muted">执行时揭晓正式结果，并按预先填写的分支处置。查看提示会记录本次参考提示，不扣星。</p></section>`;
  return save.result ? `${renderResult()}<details class="card"><summary>查看本章条件与提交方案</summary>${desk}</details>` : desk;
}
function renderMenu(): string {
  return `<section class="card chapter-menu" aria-labelledby="chapters-title"><h2 id="chapters-title">选择章节</h2>
    <p>切换或重看会重置当前尝试与引导，已有成绩和解锁保留。重试使用同一批正式设备与测量。可直接选择任意章，新玩家建议从第一章开始。</p>
    <button data-command="replay">重看本章剧情</button>
    <div class="chapters">${MISSIONS.map((item) => `<button data-chapter="${item.id}" ${item.id === save.activeId ? 'aria-current="true"' : ""}>
    <span>${item.id}. ${h(item.title)}</span><small>${save.best[item.id] ? `${save.best[item.id]} 星 · ${save.solo[item.id] ? "独立通过" : "参考通过"}` : item.id <= save.unlocked ? "已解锁" : "可提前体验"}</small></button>`).join("")}</div></section>`;
}
function renderManual(): string {
  return `<details class="card manual"><summary>检修手册与模型说明</summary>
    <p>条件概率：已知一个条件后，在符合该条件的对象中计算概率。先验是加入某份证据前的判断，后验是加入后的判断。</p>
    <p>贝叶斯更新把原有概率与检测效果一起计算。原有故障概率 p、检出率 s、误报率 f 都在 0 与 1 之间。百分比除以 100 可写成这些小数。</p>
    <p>标红后的故障概率 = p × s ÷ [p × s + (1 − p) × f]。例如 p = 0.02、s = 0.9、f = 0.05，结果 0.018 ÷ 0.067 ≈ 26.87%。未标红时用 1 − s 和 1 − f。</p>
    <p>期望总损失 = 调查费用 + 每条结果分支的“出现概率 × 处置期望损失”之和。保留的处置期望损失 = 件数 × 故障概率 × 每件故障损失；更换 = 件数 × 每件更换费。</p>
    <p>批次模型只考虑公开的三种生产状态。每种状态的新支持程度与“原支持程度 × 该状态下出现这组样品的概率”成正比，最后让三种支持程度合计为 100%。</p>
    <p>样品与待用设备在给定生产状态后独立。样品是额外制备的，不从待用批次扣除；它们用无误差检查。设备检测在真实状态给定后独立，同来源报告去重。成本与损失是教学参数，不代表现实维修报价。</p>
    <p>游戏评价执行前完整策略的期望损失；随机结果仅展示这一例可能发生的后果。同一章的实际状态和检测结果固定，操作顺序与刷新均不会重抽。更换在模型中消除本次故障，未模拟后续老化。</p>
    <p>当前完成 8 章前期教学与独立值班。可信区间、抽样偏差、对照实验和需要 1～2 小时独立规划的成熟终关尚未制作。</p>
    </details>`;
}
function render(): void {
  const current = mission();
  const inGuide = save.mode === "story" && guideStep(save.guide, current.id) !== "dispatch" && !save.result;
  const focus = document.activeElement as HTMLElement | null;
  const field = focus?.dataset.field;
  const caseIndex = focus?.dataset.case;
  root!.innerHTML = `<header class="site-header"><a href="../../${testMode ? "?test=1" : ""}" class="brand">知游 <span>街区检修站</span></a>
    <nav aria-label="检修站菜单"><button data-command="menu" aria-expanded="${menu}">章节与成绩</button><button data-command="mode">${save.mode === "story" ? "进入检修桌" : "回到剧情引导"}</button></nav></header>
    <main id="desk" tabindex="-1">${menu ? renderMenu() : ""}${inGuide ? renderGuide(save.guide, current) : renderDesk()}
    <section class="card help"><details ${save.hintLevel > 0 ? "open" : ""}><summary>本章提示</summary>
    ${current.hints.slice(0, save.hintLevel).map((hint, i) => `<p>${["思考方向", "关键条件", "参考方案"][i]}：${h(hint)}</p>`).join("")}
    <button data-command="hint" ${save.hintLevel === 3 ? "disabled" : ""}>${save.hintLevel === 0 ? "查看思考方向" : save.hintLevel === 1 ? "查看关键条件" : save.hintLevel === 2 ? "查看参考方案" : "提示已全部展开"}</button>
    <p class="muted">主动展开会记录参考提示，星级仍按同一规则计算。参考方案已通过实际规则验证。</p></details></section>
    ${renderManual()}<footer><p>${testMode ? "当前使用隔离的测试存档。" : "进度自动保存在当前浏览器。"}换设备、换网址或清理站点数据会影响进度。</p>
    ${storageFailed ? '<p class="error" role="alert">浏览器未能保存。当前页面仍可游玩，刷新后可能丢失本次进度。</p>' : ""}</footer></main>`;
  if (field && caseIndex !== undefined) root!.querySelector<HTMLElement>(`[data-case="${caseIndex}"][data-field="${field}"]`)?.focus();
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
  announce(storageFailed ? "费用和分支预览已更新，但浏览器未能保存进度。" : "方案已保存，费用和分支预览已更新。");
});
root.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!button || button.disabled) return;
  const current = mission();
  let focusTarget = "#desk";
  try {
    if (button.dataset.chapter) { startChapter(save, Number(button.dataset.chapter)); menu = false; }
    else if (button.dataset.guide) {
      guideAction(save.guide, current.id, button.dataset.guide);
      focusTarget = "#guide-title";
    } else {
      switch (button.dataset.command) {
        case "menu": menu = !menu; focusTarget = menu ? "#chapters-title" : "#desk"; break;
        case "mode": save.mode = save.mode === "story" ? "desk" : "story"; break;
        case "replay": startChapter(save, current.id); save.mode = "story"; menu = false; break;
        case "advance": advanceGuide(save.guide, current.id); focusTarget = guideStep(save.guide, current.id) === "dispatch" ? "#desk" : "#guide-title"; break;
        case "hint": save.hintLevel = Math.min(3, save.hintLevel + 1); save.hinted = true; focusTarget = ".help summary"; break;
        case "execute":
          save.result = execute(current, save.plans);
          recordScore(save);
          focusTarget = "#result-title";
          break;
        case "retry": save.result = null; save.guide.step = guideLength(current.id); break;
        case "next": startChapter(save, current.id + 1); break;
        default: return;
      }
    }
    persist();
    render();
    const target = root!.querySelector<HTMLElement>(focusTarget);
    if (target) { target.tabIndex = -1; target.focus(); }
    announce(storageFailed ? "浏览器未能保存进度，请查看页面底部说明。" : save.result
      ? `方案期望损失 ${fmt(save.result.expected)} 点，${save.result.passed ? "达到目标" : "超过目标"}。` : "进度已保存。");
  } catch (caught) {
    announce(caught instanceof Error ? caught.message : "这次操作未能完成。");
  }
});
persist();
render();
