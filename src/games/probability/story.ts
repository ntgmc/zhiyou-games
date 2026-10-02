import { escapeHtml as h } from "../../shared/html.js";
import { analyze, deviceProbability, randomUnit, sampleObservations, samplePosterior, update } from "./engine.js";
import type { Batch, Device, Mission } from "./engine.js";
import { PRECISE, SCREEN } from "./missions.js";

export const fmt = (value: number): string => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
export const pct = (value: number): string => `${fmt(value * 100)}%`;
type Step = "arrival" | "population" | "frequency" | "filter" | "update" | "cost" | "tools" | "source" | "sample";
const STEPS: readonly (readonly Step[])[] = [
  ["arrival", "population", "frequency"], ["arrival", "filter"], ["arrival", "update"],
  ["arrival", "cost"], ["arrival", "tools"], ["arrival", "source"], ["arrival", "sample"], ["arrival"],
];
export interface Guide {
  step: number;
  filtered: boolean;
  runs: number;
  redSeen: boolean;
  greenSeen: boolean;
  outcome: boolean | null;
  tried: boolean;
  traced: boolean;
  samples: number;
}
export const freshGuide = (): Guide => ({
  step: 0, filtered: false, runs: 0, redSeen: false, greenSeen: false, outcome: null, tried: false, traced: false, samples: 0,
});
export const guideLength = (id: number): number => STEPS[id - 1].length;
export const guideStep = (guide: Guide, id: number): Step | "dispatch" => STEPS[id - 1][guide.step] ?? "dispatch";
export function guideReady(guide: Guide, id: number): boolean {
  switch (guideStep(guide, id)) {
    case "arrival": return true;
    case "population": case "filter": return guide.filtered;
    case "frequency": return guide.runs > 0;
    case "update": return guide.redSeen && guide.greenSeen;
    case "cost": case "tools": return guide.tried;
    case "source": return guide.traced;
    case "sample": return guide.samples > 0;
    default: return false;
  }
}
export function advanceGuide(guide: Guide, id: number): boolean {
  if (!guideReady(guide, id)) return false;
  guide.step++;
  guide.tried = false;
  return true;
}
export function guideAction(guide: Guide, id: number, action: string): boolean {
  const step = guideStep(guide, id);
  if (action === "filter" && (step === "population" || step === "filter")) guide.filtered = true;
  else if (action === "draw" && step === "frequency" && guide.runs < 100) guide.runs++;
  else if ((action === "red" || action === "green") && step === "update") {
    guide.outcome = action === "red";
    guide.redSeen ||= guide.outcome;
    guide.greenSeen ||= !guide.outcome;
  } else if (action === "compare" && (step === "cost" || step === "tools")) guide.tried = true;
  else if (action === "trace" && step === "source") guide.traced = true;
  else if (action === "sample" && step === "sample") guide.samples = guide.samples === 2 ? 4 : 2;
  else return false;
  return true;
}
export function readGuide(value: unknown, id: number): Guide {
  const guide = freshGuide();
  if (!value || typeof value !== "object") return guide;
  const data = value as Guide;
  if (Number.isInteger(data.step) && data.step >= 0 && data.step <= guideLength(id)) guide.step = data.step;
  for (const key of ["filtered", "redSeen", "greenSeen", "tried", "traced"] as const) guide[key] = data[key] === true;
  if (Number.isInteger(data.runs) && data.runs >= 0 && data.runs <= 100) guide.runs = data.runs;
  if (data.outcome === true || data.outcome === false) guide.outcome = data.outcome;
  if ([0, 2, 4].includes(data.samples)) guide.samples = data.samples;
  return guide;
}

export function detectorExplanation(job: Device): string {
  return `<p>原有故障概率 ${pct(job.prior)}，来自同类设备的校准记录。百分比是每 100 份同类情况中的平均占比，不保证这一台的状态。</p>
    <p>“检出”指故障设备被标红，“误报”指正常设备也被标红。</p>
    ${job.evidence.length && job.detectors.length ? "<p>模型把故障和正常两组分别看：在每组内，初筛结果不会改变新检测标红的机会，这叫条件独立。同一测量的转录件只计一次。</p>" : ""}`;
}
export function batchExplanation(job: Batch): string {
  return `<p>这批有 ${job.count} 件待用设备。生产状态未知，模型只考虑 ${job.rates.map(pct).join("、")} 三种故障率。
    原先对这三种状态的支持分别是 ${job.weights.map(pct).join("、")}，表示各状态成立的概率，来自事先校准，合计 100%。</p>
    <p>取样使用同一生产状态下额外制备的样品，每件付 ${job.sampleCost} 点、占 1 格工时。实验室检查样品真实状态，不会漏报。
    样品不属于这 ${job.count} 件待用设备；在每种生产状态内，一件的好坏不会改变另一件故障的概率，这叫条件独立。真实生产过程未必符合这些简化条件。</p>`;
}
export function populationTable(prior: number, filtered: boolean): string {
  const badRed = prior * 1000 * SCREEN.sensitivity;
  const normalRed = (1 - prior) * 1000 * SCREEN.falseAlarm;
  return `<div class="table-wrap"><table><caption>用 1,000 台作比例示意，实际取样数量会波动</caption><thead><tr><th>真实状态</th><th>${filtered ? "已经标红" : "同类设备数量"}</th></tr></thead>
    <tbody><tr><th>有故障</th><td>${fmt(filtered ? badRed : prior * 1000)}</td></tr>
    <tr><th>正常</th><td>${fmt(filtered ? normalRed : (1 - prior) * 1000)}</td></tr></tbody></table></div>
    ${filtered ? `<p class="observation">只看标红组：${fmt(badRed)} ÷ (${fmt(badRed)} + ${fmt(normalRed)}) = ${pct(badRed / (badRed + normalRed))} 有故障。</p>` : ""}`;
}
export function branchTable(job: Device | Batch, plan: Parameters<typeof analyze>[1]): string {
  const analysis = analyze(job, plan);
  return `<div class="table-wrap"><table><caption>按当前模型计算所有结果分支</caption><thead><tr><th>调查结果</th><th>出现概率</th><th>结果后的故障概率</th><th>处置</th><th>处置期望损失</th></tr></thead><tbody>
    ${analysis.branches.map((branch) => `<tr><th>${h(branch.label)}</th><td>${pct(branch.chance)}</td><td>${pct(branch.fault)}</td><td>${branch.action === "keep" ? "保留" : "更换"}</td><td>${fmt(branch.loss)} 点</td></tr>`).join("")}
    </tbody></table></div><p>调查费 ${fmt(analysis.cost)} 点 + 各分支的“出现概率 × 处置期望损失” = <strong>${fmt(analysis.expected)} 点</strong>。</p>`;
}
export function renderGuide(guide: Guide, mission: Mission): string {
  const step = guideStep(guide, mission.id);
  const job = mission.cases[0];
  let text = "";
  let task = "";
  if (step === "arrival") {
    text = mission.opening;
    task = `<p>罗师傅：${mission.id === 8 ? "所有检修单都要安排。调查费用和工时共同使用，处置可以不同。条件和记录随时能查，决定由你来做。"
      : "先在练习台观察这次需要的知识，再写正式方案。练习不消耗调查预算，也不会泄露正式检测结果。"}</p>`;
  } else if (step === "population" || step === "filter") {
    const prior = (job as Device).prior;
    text = step === "population"
      ? "罗师傅：记录里 20% 的同类灯有故障，就是每 100 台平均约 20 台。快速筛查会标出 90% 的故障灯，也会误标 5% 的正常灯。先看看被标红的是哪些。"
      : "罗师傅：这次原有故障概率是 2%，就是每 100 台平均约 2 台。检测器表现没变，但正常设备多了，误报也会多。点击“只看标红组”比较这组内部的数量。";
    task = populationTable(prior, guide.filtered) + `<button data-guide="filter">只看标红组</button>`
      + (guide.filtered ? "<p>条件概率就是知道某个条件后，只在符合条件的对象中计算占比。这里的条件是“已经标红”。</p>" : "");
  } else if (step === "frequency") {
    text = "罗师傅：按 20% 的概率，试着抽 20 台同类灯。抽到的故障占比叫这次观察到的频率。换一组样本，它可能变化。";
    const counts = [guide.runs - 1, guide.runs].filter((run) => run > 0).map((run) =>
      Array.from({ length: 20 }, (_, i) => randomUnit(mission.seed, `practice:${run}:${i}`) < 0.2).filter(Boolean).length);
    task = `<button data-guide="draw" ${guide.runs >= 100 ? "disabled" : ""}>抽取一组 20 台</button>${counts.map((count, i) =>
      `<p class="observation">${counts.length > 1 && i === 0 ? "上一组" : "当前组"}：${count} 台故障，观察频率 ${pct(count / 20)}。模型概率仍是 20%。</p>`).join("")}
      <p>可以再抽一组比较。这是练习样本；正式任务评价整套方案的平均损失，一次抽样结果另行记录。</p>`;
  } else if (step === "update") {
    text = "罗师傅：加入新证据之前的判断叫先验，加入之后叫后验。现在先验是初筛标红后的 26.87%。台架能检出 95% 的故障，正常设备误报 1%。分别试试两种结果。";
    const device = job as Device;
    const before = deviceProbability(device);
    task = `<div class="actions"><button data-guide="red">假设复检标红</button><button data-guide="green">假设复检未标红</button></div>
      ${guide.outcome === null ? "" : `<p class="observation">复检${guide.outcome ? "标红" : "未标红"}，后验故障概率 ${pct(update(before, PRECISE.sensitivity, PRECISE.falseAlarm, guide.outcome).fault)}。</p>`}
      <p>同一测量转录多份不会增加证据。台架这次是新的测量，模型假设它与初筛在真实状态确定后相互独立。</p>
      <p>已观察：标红 ${guide.redSeen ? "✓" : "待试"}；未标红 ${guide.greenSeen ? "✓" : "待试"}。</p>`;
  } else if (step === "cost" || step === "tools") {
    text = step === "cost"
      ? "罗师傅：损失统一用“点”计量，既包括花掉的材料，也包括留下故障的后果。期望损失是同类情况重复发生时的平均损失。调查费也得记入方案。"
      : "罗师傅：便携检测只占 1 格工时，台架占 2 格。工具说明里，检出率表示故障被标红的概率，误报率表示正常被标红的概率。先比较一次完整方案。";
    task = `<button data-guide="compare">比较处置方案</button>`;
    if (guide.tried && job.kind === "device") {
      task += `<p>直接更换：${job.replaceCost} 点；直接保留：${pct(deviceProbability(job))} × ${job.faultLoss} = ${fmt(deviceProbability(job) * job.faultLoss)} 点。</p>`;
      for (const detector of job.detectors) {
        task += `<h3>${h(detector.name)}：标红更换，未标红保留</h3>` + branchTable(job, { detectorId: detector.id, red: "replace", green: "keep", samples: 0, cutoff: 1 });
      }
    }
  } else if (step === "source") {
    text = "罗师傅：两张纸可能只是同一份测量的原件和抄件。看看页脚的来源编号，再决定它们是否提供了两次独立信息。";
    task = `<button data-guide="trace">核对报告来源</button>${guide.traced && job.kind === "device"
      ? `<ul>${job.evidence.map((report) => `<li>${h(report.title)}：${h(report.source)}，${report.red ? "标红" : "未标红"}</li>`).join("")}</ul>
      <p class="observation">两份报告都来自 A-17，只计一次。当前故障概率仍为 ${pct(deviceProbability(job))}。</p>` : ""}`;
  } else if (step === "sample" && job.kind === "batch") {
    text = "罗师傅：样品有几件坏，会改变我们对生产状态的判断。先用练习批次试两件，再试四件。练习与正式任务来自不同批次，结果分别保存。";
    task = batchExplanation(job) + `<button data-guide="sample">${guide.samples === 2 ? "把练习样本增加到 4 件" : "检查 2 件练习样品"}</button>`;
    if (guide.samples) {
      const observations = sampleObservations(job, mission.seed + 1, guide.samples);
      const k = observations.filter(Boolean).length;
      const next = samplePosterior(job, guide.samples, k);
      task += `<p class="observation">${guide.samples} 件样品：${observations.map((bad, i) => `${i + 1} 号${bad ? "故障" : "正常"}`).join("，")}。</p>
        <ul>${job.rates.map((rate, i) => `<li>故障率 ${pct(rate)} 的状态：支持程度由 ${pct(job.weights[i])} 变为 ${pct(next.weights[i])}。</li>`).join("")}</ul>
        <p>把三种故障率各乘它新的支持概率，再相加，得到加权平均故障率 ${pct(next.fault)}。没有抽到坏件，也不能认定整批没有故障。</p>`;
    }
  }
  return `<section class="card dialogue" aria-labelledby="guide-title"><p class="eyebrow">检修站 · 第 ${mission.id} 章 · 引导 ${guide.step + 1}/${guideLength(mission.id)}</p>
    <h2 id="guide-title">${h(mission.title)}</h2><p>${h(text)}</p><div class="practice">${task}</div>
    <button class="primary" data-command="advance" ${guideReady(guide, mission.id) ? "" : "disabled"}>${step === "arrival" ? "接下检修单" : "继续"}</button>
    ${guideReady(guide, mission.id) ? "" : '<p class="muted">先完成上面的练习，再继续。</p>'}</section>`;
}
