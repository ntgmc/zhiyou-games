import { escapeHtml as h } from "../../shared/html.js";
import { actionName, analyze } from "./engine.js";
import type { Mission, Plan, Result } from "./engine.js";
import { fmt, pct } from "./story.js";

export function renderResult(current: Mission, plans: readonly Plan[], result: Result, hinted: boolean, last: boolean): string {
  const analyses = current.cases.map((job, i) => analyze(job, plans[i]));
  const largest = analyses.reduce((best, item, i) => item.expected > analyses[best].expected ? i : best, 0);
  const largestBranch = analyses[largest].branches.reduce((best, branch) => branch.chance * branch.loss > best.chance * best.loss ? branch : best);
  let replacement = 0;
  let faultLoss = 0;
  const responses = result.outcomes.map((outcome, index) => {
    const job = current.cases[index];
    const count = job.kind === "batch" ? job.count : 1;
    if (outcome.action === "replace") replacement += count * job.replaceCost;
    else faultLoss += outcome.faults * job.faultLoss;
    const reply = outcome.action === "replace" ? `${count} 件设备已更换，可以交回使用。`
      : outcome.faults ? `保留使用后，${outcome.faults} 件出了故障，产生 ${fmt(outcome.faults * job.faultLoss)} 点损失。`
      : `${count} 件设备保留使用，这次没有出故障。`;
    return `<li><span>${h(job.requester)}</span><div><strong>${h(job.title)}</strong><p>${h(reply)}</p></div></li>`;
  }).join("");
  return `<section class="card result ${result.passed ? "success" : "failure"}" aria-labelledby="result-title">
    <div class="result-heading"><div><p class="eyebrow">检修完成 · 设备交回</p><h1 id="result-title" tabindex="-1">${result.passed ? "这份方案通过了" : "再调整一下方案"}</h1></div>
    ${result.passed ? `<div class="earned"><span aria-label="${result.stars} 星">${"★".repeat(result.stars)}${"☆".repeat(3 - result.stars)}</span><small>${hinted ? "参考提示通过" : "独立通过"}</small></div>` : '<span class="result-status">未达到目标</span>'}</div>
    <ul class="return-list">${responses}</ul><div class="recap"><span>本章笔记</span><p>${h(current.recap)}</p></div>
    <div class="result-comparison"><section class="score-account"><h2>评分用的平均损失</h2><p class="account-number">${fmt(result.expected)}<small> 点</small></p>
    <p>按这套方案处理许多次同类任务，平均每次损失约 ${fmt(result.expected)} 点。计算时，所有可能的检测结果和相应处理都会计入。这叫“期望损失”。</p>
    <p class="score-target">通关不超过 ${current.goal} 点 · 3 星不超过 ${current.efficient} 点</p>
    <p>${result.passed ? `平均损失低于或等于通关目标，所以本次通过，获得 ${result.stars} 星。` : `平均损失超出通关目标 ${fmt(result.expected - current.goal)} 点，需要调整方案。`}</p></section>
    <section class="actual-account"><h2>这次实际的账单</h2><p class="account-number">${fmt(result.actual)}<small> 点</small></p>
    <dl class="actual-breakdown"><div><dt>检测与取样费</dt><dd>${fmt(result.cost)} 点</dd></div><div><dt>更换设备费用</dt><dd>${fmt(replacement)} 点</dd></div><div><dt>保留设备的故障损失</dt><dd>${fmt(faultLoss)} 点</dd></div></dl>
    <p>这次共损失 ${fmt(result.actual)} 点：${fmt(result.cost)} 点调查费 + ${fmt(replacement)} 点更换费 + ${fmt(faultLoss)} 点故障损失。</p>
    <p>这张账单只记录刚才发生的情况。方案也可能遇到其他检测结果，因此通关和星级按评分栏的平均损失 ${fmt(result.expected)} 点计算。</p></section></div>
    ${result.passed ? "" : `<details class="failure-review" data-panel="failure"><summary>从哪里开始调整？</summary>
    <p>“${h(current.cases[largest].title)}”的平均损失最高，为 ${fmt(analyses[largest].expected)} 点，其中调查费 ${fmt(analyses[largest].cost)} 点。</p>
    <p>在“${h(largestBranch.label)}”时，你安排了${actionName(largestBranch.action)}。这种结果的出现概率 ${pct(largestBranch.chance)} × 处理后的平均损失 ${fmt(largestBranch.loss)} 点，计入评分约 ${fmt(largestBranch.chance * largestBranch.loss)} 点。展开提交方案里的计算，可以比较其他处理。</p></details>`}
    <details data-panel="execution"><summary>查看检测结果与设备的实际情况</summary><div class="table-wrap"><table><thead><tr><th>检修单</th><th>检测或取样结果</th><th>看到结果后的故障概率</th><th>怎么处理</th><th>更换前的坏件数</th><th>这次实际损失</th></tr></thead><tbody>
    ${result.outcomes.map((outcome, index) => `<tr><th>${h(current.cases[index].title)}</th><td>${h(outcome.observation)}</td><td>${pct(outcome.posterior)}</td><td>${actionName(outcome.action)}</td><td>${outcome.faults}</td><td>${fmt(outcome.actual)} 点</td></tr>`).join("")}
    </tbody></table></div><p>设备实际坏了几件，在执行后才揭晓。重试保留这些设备和检测结果，方便比较不同方案；刷新也不会重新抽取。</p></details>
    <div class="actions"><button data-command="retry">调整本章方案</button>
    ${result.passed && !last ? '<button class="primary" data-command="next">接下一章检修单</button>' : ""}</div>
    ${result.passed && last ? '<p class="edition-note">你已完成首版的 8 章。抽样偏差、对照实验和长篇综合挑战尚未制作。</p>' : ""}
    <p class="muted reset-note">调整方案会清除这次账单，保留你的设置、成绩和解锁进度。本次使用过提示的记录也会保留。</p></section>`;
}
