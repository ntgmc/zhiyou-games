import { escapeHtml as h } from "../../shared/html.js";
import { analyze, deviceProbability, randomUnit, sampleObservations, samplePosterior, update } from "./engine.js";
import type { Batch, Device, Mission } from "./engine.js";
import { PRECISE, SCREEN } from "./jobs.js";

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
const stepsFor = (id: number): readonly Step[] => STEPS[id - 1] ?? ["arrival"];
export const guideLength = (id: number): number => stepsFor(id).length;
export const guideStep = (guide: Guide, id: number): Step | "dispatch" => stepsFor(id)[guide.step] ?? "dispatch";
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
  return `<p>过去的同类设备中，约 ${pct(job.prior)} 有故障。这是看到检测报告之前的判断。</p>
    <p>检出率：坏设备被标红的比例。误报率：好设备被误标为异常的比例。未标红也可能漏掉故障。</p>
    ${job.evidence.length && job.detectors.length ? "<p>复检是一次新测量。模型假设：固定设备实际是好的还是坏的以后，两次检测各按自己的概率工作，互不影响。这叫“条件独立”。抄写同一次检测的报告只算一份。</p>" : ""}`;
}
export function batchExplanation(job: Batch): string {
  return `<p>这批有 ${job.count} 件待用设备。我们暂时不知道生产线是哪种状态，先按以往记录考虑下面三种可能。</p>
    <div class="table-wrap"><table><caption>检查样品前，对生产状态的判断</caption><thead><tr><th>该状态下的故障率</th><th>生产线处于该状态的概率</th></tr></thead><tbody>
    ${job.rates.map((rate, i) => `<tr><td>${pct(rate)}</td><td>${pct(job.weights[i])}</td></tr>`).join("")}</tbody></table></div>
    <p>样品和这批设备在同一生产状态下制成，额外取样不减少待用件数。每检查 1 件花 ${job.sampleCost} 点、占 1 格工时，检查能准确判断样品的好坏。</p>
    <p>模型假设：生产状态相同时，各件设备的好坏互不影响。这叫“条件独立”。实际生产未必符合这个假设，也可能有表外的其他故障率。</p>`;
}
export function populationTable(prior: number, filtered: boolean): string {
  const badRed = prior * 1000 * SCREEN.sensitivity;
  const normalRed = (1 - prior) * 1000 * SCREEN.falseAlarm;
  return `<div class="table-wrap"><table><caption>按比例换算成 1,000 台，数量仅作示意</caption><thead><tr><th>设备实际情况</th><th>${filtered ? "其中被标红的数量" : "同类设备数量"}</th></tr></thead>
    <tbody><tr><th>有故障</th><td>${fmt(filtered ? badRed : prior * 1000)}</td></tr>
    <tr><th>正常</th><td>${fmt(filtered ? normalRed : (1 - prior) * 1000)}</td></tr></tbody></table></div>
    ${filtered ? `<p class="observation">标红组里，${fmt(badRed)} 台坏灯和 ${fmt(normalRed)} 台好灯混在一起。坏灯占 ${fmt(badRed)} ÷ (${fmt(badRed)} + ${fmt(normalRed)}) = ${pct(badRed / (badRed + normalRed))}。</p>` : ""}`;
}
export function branchTable(job: Device | Batch, plan: Parameters<typeof analyze>[1]): string {
  const analysis = analyze(job, plan);
  return `<div class="table-wrap"><table><caption>每种可能结果都按出现概率计入评分</caption><thead><tr><th>调查结果</th><th>出现概率</th><th>此时的故障概率</th><th>怎么处理</th><th>处理后的平均损失</th><th>计入评分的损失</th></tr></thead><tbody>
    ${analysis.branches.map((branch) => `<tr><th>${h(branch.label)}</th><td>${pct(branch.chance)}</td><td>${pct(branch.fault)}</td><td>${branch.action === "keep" ? "保留" : "更换"}</td><td>${fmt(branch.loss)} 点</td><td>${fmt(branch.chance * branch.loss)} 点</td></tr>`).join("")}
    </tbody></table></div><p>最后一列 = 出现概率 × 处理后的平均损失。把这一列相加，再加 ${fmt(analysis.cost)} 点调查费，方案平均损失为 <strong>${fmt(analysis.expected)} 点</strong>。这个平均数也叫“期望损失”。</p>`;
}
export function renderHints(mission: Mission, level: number, open: boolean): string {
  return `<aside class="chapter-help" aria-label="本章提示"><button class="text-button help-toggle" data-command="hint" aria-expanded="${open}" aria-controls="chapter-hints">
    本章提示<span>${level ? `已查看 ${level}/3 条` : "查看会记录为使用提示，不扣星"}</span><span aria-hidden="true">${open ? "−" : "+"}</span></button>
    ${open ? `<div id="chapter-hints" class="hint-content">${mission.hints.slice(0, level).map((hint, i) =>
      `<section><h3>${["思考方向", "关键条件", "参考方案"][i]}</h3><p>${h(hint)}</p></section>`).join("")}
      ${level < 3 ? `<button data-command="hint-next">查看${level === 1 ? "关键条件" : "参考方案"}</button>` : ""}
      <p class="muted">使用提示后，本次通过会记为“参考提示通过”。已有的独立成绩保留。</p></div>` : '<div id="chapter-hints" hidden></div>'}</aside>`;
}
export function renderGuide(guide: Guide, mission: Mission): string {
  const step = guideStep(guide, mission.id);
  const job = mission.cases[0];
  let text = "";
  let task = "";
  if (step === "arrival") {
    text = mission.opening;
    task = `<p>${mission.id >= 8 ? `罗师傅：${mission.cases.length} 份单都要处理，共用 ${mission.budget} 点调查预算和 ${mission.work} 格工时。资料、费用和完整处理条件都在检修桌，怎么查、怎么处理，由你来定。`
      : "罗师傅：先用练习台试一试，再安排这张单。练习不花正式预算，练习结果也和正式检测分开。"}</p>`;
  } else if (step === "population" || step === "filter") {
    const prior = (job as Device).prior;
    text = step === "population"
      ? "记录里，20% 的同类灯有故障，意思是每 100 台平均约 20 台坏了。快速筛查能标出 90% 的坏灯，也会把 5% 的好灯误标红。筛出标红的灯，看看里面好坏各有多少。"
      : "这次同类灯的故障概率是 2%，每 100 台平均约 2 台坏了。检测器没变，好灯却更多了。点“只看标红组”，看看误报的好灯占了多少。";
    task = populationTable(prior, guide.filtered) + `<button data-guide="filter">只看标红组</button>`
      + (guide.filtered ? "<p>我们只在“已经标红”的灯里算坏灯的占比，这叫条件概率。好灯被误标红，叫误报。</p>" : "");
  } else if (step === "frequency") {
    text = "现在抽 20 台同类灯看看。我们抽到的坏灯占比叫“频率”，换一组可能会变。记录里的故障概率仍是 20%。";
    const counts = [guide.runs - 1, guide.runs].filter((run) => run > 0).map((run) =>
      Array.from({ length: 20 }, (_, i) => randomUnit(mission.seed, `practice:${run}:${i}`) < 0.2).filter(Boolean).length);
    task = `<button data-guide="draw" ${guide.runs >= 100 ? "disabled" : ""}>抽取一组 20 台</button>${counts.map((count, i) =>
      `<p class="observation">${counts.length > 1 && i === 0 ? "上一组" : "这一组"}抽到 ${count} 台坏灯，占 ${count} ÷ 20 = ${pct(count / 20)}。</p>`).join("")}
      <p>可以再抽一组比较。20% 说明同类灯有多大可能坏了，不能保证每组都正好抽到 4 台坏灯。</p>`;
  } else if (step === "update") {
    text = "初筛标红后，我们判断这盏有 26.87% 的可能坏了。“台架复检”就是接到检测台上再测一次，它能检出 95% 的坏灯，会误标 1% 的好灯。分别假设复检标红、未标红，看看故障概率会怎么变。";
    const device = job as Device;
    const before = deviceProbability(device);
    task = `<div class="actions"><button data-guide="red">假设复检标红</button><button data-guide="green">假设复检未标红</button></div>
      ${guide.outcome === null ? "" : `<p class="observation">如果复检${guide.outcome ? "标红" : "未标红"}，故障概率会从 ${pct(before)} 变为 ${pct(update(before, PRECISE.sensitivity, PRECISE.falseAlarm, guide.outcome).fault)}。</p>
      <p>复检前的判断叫“先验”，看到结果后的判断叫“后验”。结合已有判断和新检测效果重新计算，叫贝叶斯更新。</p>`}
      <p>这里假设：灯实际坏了时，两次检测各按自己的检出率工作；灯是好的时，各按自己的误报率工作，互不影响。这叫条件独立。抄一份报告不能算作新检测。</p>
      <p class="practice-status">标红结果：${guide.redSeen ? "已试过" : "还没试"} · 未标红结果：${guide.greenSeen ? "已试过" : "还没试"}</p>`;
  } else if (step === "cost" || step === "tools") {
    text = step === "cost"
      ? "我们用“点”把检测费、更换费和留下坏灯的损失记在一本账上。按同一方案处理很多次同类任务，平均每次损失多少，叫“期望损失”。点开比较，看看检测费涨了以后哪种处理划算。"
      : "便携检测花 1 点、占 1 格工时，台架花 3 点、占 2 格。1 格代表一份检查工作量，游戏里不用等时间过去。便宜的检测可能漏掉更多坏风机，先算算两种方案的总损失。";
    task = `<button data-guide="compare">比较处理方案</button>`;
    if (guide.tried && job.kind === "device") {
      task += `<p>直接更换花 ${job.replaceCost} 点。保留时，好设备不产生故障损失，坏设备会损失 ${job.faultLoss} 点；平均损失为 ${pct(deviceProbability(job))} × ${job.faultLoss} = ${fmt(deviceProbability(job) * job.faultLoss)} 点。</p>`;
      for (const detector of job.detectors) {
        task += `<h3>${h(detector.name)}：标红更换，未标红保留</h3>` + branchTable(job, { detectorId: detector.id, red: "replace", green: "keep", samples: 0, cutoff: 1 });
      }
    }
  } else if (step === "source") {
    text = "这两张纸，可能只是同一次检测的原件和抄件。核对页脚的测量编号，看看一共测过几次。";
    task = `<button data-guide="trace">核对报告来源</button>${guide.traced && job.kind === "device"
      ? `<ul>${job.evidence.map((report) => `<li>${h(report.title)}：${h(report.source)}，${report.red ? "标红" : "未标红"}</li>`).join("")}</ul>
      <p class="observation">两份报告的编号都是 A-17，只测过一次。计算时用一次报告，故障概率仍是 ${pct(deviceProbability(job))}。</p>` : ""}`;
  } else if (step === "sample" && job.kind === "batch") {
    text = "这批开关有多大可能出故障，要借样品来判断。先检查 2 件练习样品，也可以增加到 4 件。练习批次和正式批次分开，结果互不影响。";
    task = batchExplanation(job) + `<button data-guide="sample">${guide.samples === 2 ? "把练习样本增加到 4 件" : "检查 2 件练习样品"}</button>`;
    if (guide.samples) {
      const observations = sampleObservations(job, mission.seed + 1, guide.samples);
      const k = observations.filter(Boolean).length;
      const next = samplePosterior(job, guide.samples, k);
      task += `<p class="observation">${guide.samples} 件样品：${observations.map((bad, i) => `${i + 1} 号${bad ? "故障" : "正常"}`).join("，")}。</p>
        <ul>${job.rates.map((rate, i) => `<li>生产线处于“故障率 ${pct(rate)}”状态的概率：从 ${pct(job.weights[i])} 变为 ${pct(next.weights[i])}。</li>`).join("")}</ul>
        <p>用每种状态的新概率乘它的故障率，再相加，待用设备的平均故障率为 ${pct(next.fault)}。这个算法叫加权平均：更可能出现的状态，算进去的份量更大。没查到坏样品，也不能保证这批全是好的。</p>`;
    }
  }
  const last = guide.step === guideLength(mission.id) - 1;
  return `<div class="guide-layout"><aside class="scene-file" aria-label="本章检修单"><span class="file-tab">街区检修站</span>
    <div class="repair-illustration" aria-hidden="true"><span class="lamp-shade"></span><span class="lamp-stem"></span><span class="lamp-base"></span></div>
    <p class="eyebrow">第 ${String(mission.id).padStart(2, "0")} 章 · ${mission.cases.length} 份检修单</p><h2>${h(job.title)}</h2>
    <p>${h(job.requester)}：${h(job.request)}</p>${mission.cases.length > 1 ? `<ul>${mission.cases.slice(1).map((item) => `<li>${h(item.title)}</li>`).join("")}</ul>` : ""}
    <span class="file-stamp">${mission.id >= 8 ? "独立值班" : "待检修"}</span></aside>
    <section class="card dialogue" aria-labelledby="guide-title"><div class="guide-heading"><p class="eyebrow">第 ${mission.id} 章 · ${h(mission.concept)}</p>
    <span class="step-count">${guide.step + 1} / ${guideLength(mission.id)}</span></div>
    <div class="guide-progress" aria-label="引导 ${guide.step + 1}/${guideLength(mission.id)}">${stepsFor(mission.id).map((_, i) => `<span class="${i <= guide.step ? "seen" : ""}" aria-hidden="true"></span>`).join("")}</div>
    <h1 id="guide-title" tabindex="-1">${h(mission.title)}</h1><div class="speaker"><span aria-hidden="true">${step === "arrival" ? "记" : "罗"}</span><div>${step === "arrival" ? "报修记录" : "罗师傅"}<small>${step === "arrival" ? "检修单送到了" : "带你试一次"}</small></div></div>
    <p class="dialogue-copy">${h(text)}</p><div class="practice"><p class="practice-label">${step === "arrival" ? "接单说明" : "练习台"}</p>${task}</div>
    <div class="guide-actions"><button class="primary" data-command="advance" ${guideReady(guide, mission.id) ? "" : "disabled"}>${step === "arrival" ? mission.id >= 8 ? "开始独立值班" : "接下检修单" : last ? "去安排检修方案" : "继续"}</button>
    ${guideReady(guide, mission.id) ? "" : '<p class="muted">完成这一步练习后，就可以继续。</p>'}</div></section></div>`;
}
