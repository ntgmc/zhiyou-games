export type Action = "keep" | "replace";
export interface Detector {
  id: string;
  name: string;
  sensitivity: number;
  falseAlarm: number;
  cost: number;
  work: number;
}
export interface Evidence {
  source: string;
  title: string;
  detector: Detector;
  red: boolean;
}
interface Job {
  id: string;
  title: string;
  requester: string;
  request: string;
  replaceCost: number;
  faultLoss: number;
}
export interface Device extends Job {
  kind: "device";
  prior: number;
  evidence: readonly Evidence[];
  detectors: readonly Detector[];
}
export interface Batch extends Job {
  kind: "batch";
  rates: readonly number[];
  weights: readonly number[];
  count: number;
  sampleCost: number;
  maxSamples: number;
}
export type Case = Device | Batch;
export interface Plan {
  detectorId: string;
  red: Action;
  green: Action;
  samples: number;
  cutoff: number;
}
export interface Mission {
  id: number;
  title: string;
  concept: string;
  opening: string;
  cases: readonly Case[];
  budget: number;
  work: number;
  goal: number;
  efficient: number;
  seed: number;
  hints: readonly [string, string, string];
  reference: readonly Plan[];
  recap: string;
}
export interface Branch {
  label: string;
  chance: number;
  fault: number;
  action: Action;
  loss: number;
  weights: readonly number[];
}
export interface Analysis {
  fault: number;
  cost: number;
  work: number;
  expected: number;
  branches: readonly Branch[];
}
export interface Outcome {
  caseId: string;
  observation: string;
  action: Action;
  faults: number;
  actual: number;
  posterior: number;
}
export interface Result {
  expected: number;
  actual: number;
  cost: number;
  work: number;
  stars: number;
  passed: boolean;
  outcomes: readonly Outcome[];
}
export const defaultPlan = (): Plan => ({ detectorId: "", red: "keep", green: "keep", samples: 0, cutoff: 1 });
export const actionName = (action: Action): string => action === "keep" ? "保留使用" : "更换";
export const probability = (value: number): boolean => Number.isFinite(value) && value >= 0 && value <= 1;

export function update(prior: number, sensitivity: number, falseAlarm: number, red: boolean): { chance: number; fault: number } {
  if (![prior, sensitivity, falseAlarm].every(probability)) throw new Error("概率须在 0 与 1 之间。");
  const faultPart = prior * (red ? sensitivity : 1 - sensitivity);
  const normalPart = (1 - prior) * (red ? falseAlarm : 1 - falseAlarm);
  const chance = faultPart + normalPart;
  // Impossible observations never execute; zero-mass branches contribute no loss.
  return { chance, fault: chance === 0 ? prior : faultPart / chance };
}

export function deviceProbability(job: Device): number {
  let fault = job.prior;
  const seen = new Map<string, Evidence>();
  for (const report of job.evidence) {
    const previous = seen.get(report.source);
    if (previous) {
      if (previous.red !== report.red || previous.detector.id !== report.detector.id) throw new Error("同一测量的报告互相矛盾。");
      continue;
    }
    const next = update(fault, report.detector.sensitivity, report.detector.falseAlarm, report.red);
    if (next.chance === 0) throw new Error("报告与当前模型不相容。");
    fault = next.fault;
    seen.set(report.source, report);
  }
  return fault;
}

export function binomial(n: number, k: number, rate: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0 || k > n || !probability(rate)) throw new Error("无效的取样参数。");
  let combinations = 1;
  for (let i = 1; i <= k; i++) combinations *= (n - i + 1) / i;
  return combinations * rate ** k * (1 - rate) ** (n - k);
}

export function samplePosterior(job: Batch, n: number, k: number): { chance: number; weights: number[]; fault: number } {
  if (n > job.maxSamples) throw new Error("样本数超过本批上限。");
  const parts = job.rates.map((rate, i) => job.weights[i] * binomial(n, k, rate));
  const chance = parts.reduce((a, b) => a + b, 0);
  const weights = chance === 0 ? [...job.weights] : parts.map((part) => part / chance);
  return { chance, weights, fault: weights.reduce((sum, weight, i) => sum + weight * job.rates[i], 0) };
}

export function validPlan(value: unknown): value is Plan {
  if (!value || typeof value !== "object") return false;
  const p = value as Plan;
  return typeof p.detectorId === "string" && p.detectorId.length <= 40
    && ["keep", "replace"].includes(p.red) && ["keep", "replace"].includes(p.green)
    && Number.isInteger(p.samples) && p.samples >= 0 && p.samples <= 4
    && Number.isInteger(p.cutoff) && p.cutoff >= 0 && p.cutoff <= p.samples + 1;
}

export function planError(job: Case, plan: Plan): string | null {
  if (!validPlan(plan)) return "方案格式无效，请重新选择检测和处置。";
  if (job.kind === "device") {
    if (plan.samples !== 0 || plan.cutoff !== 1) return "单台设备不使用批次取样设置。";
    if (plan.detectorId && !job.detectors.some((detector) => detector.id === plan.detectorId)) return "这台检测器当前不可用。";
  } else {
    if (plan.detectorId || plan.samples > job.maxSamples) return "请在本批允许的样本数内取样。";
  }
  return null;
}

function loss(job: Case, fault: number, action: Action): number {
  const count = job.kind === "batch" ? job.count : 1;
  return count * (action === "replace" ? job.replaceCost : fault * job.faultLoss);
}

export function analyze(job: Case, plan: Plan): Analysis {
  const error = planError(job, plan);
  if (error) throw new Error(error);
  const branches: Branch[] = [];
  let cost = 0;
  let work = 0;
  let fault: number;
  if (job.kind === "device") {
    fault = deviceProbability(job);
    const detector = job.detectors.find((item) => item.id === plan.detectorId);
    if (detector) {
      cost = detector.cost;
      work = detector.work;
      for (const red of [true, false]) {
        const next = update(fault, detector.sensitivity, detector.falseAlarm, red);
        const action = red ? plan.red : plan.green;
        branches.push({ label: red ? "标红" : "未标红", chance: next.chance, fault: next.fault, action, loss: loss(job, next.fault, action), weights: [] });
      }
    } else branches.push({ label: "直接处置", chance: 1, fault, action: plan.red, loss: loss(job, fault, plan.red), weights: [] });
  } else {
    fault = job.rates.reduce((sum, rate, i) => sum + rate * job.weights[i], 0);
    cost = plan.samples * job.sampleCost;
    work = plan.samples;
    for (let k = 0; k <= plan.samples; k++) {
      const next = samplePosterior(job, plan.samples, k);
      const action: Action = k >= plan.cutoff ? "replace" : "keep";
      branches.push({ label: `${k} 件样品有故障`, chance: next.chance, fault: next.fault, action, loss: loss(job, next.fault, action), weights: next.weights });
    }
  }
  return { fault, cost, work, expected: cost + branches.reduce((sum, branch) => sum + branch.chance * branch.loss, 0), branches };
}

export function missionError(mission: Mission, plans: readonly Plan[]): string | null {
  if (plans.length !== mission.cases.length) return "请为每份检修单安排处置。";
  let cost = 0;
  let work = 0;
  for (let i = 0; i < plans.length; i++) {
    const error = planError(mission.cases[i], plans[i]);
    if (error) return error;
    const analysis = analyze(mission.cases[i], plans[i]);
    cost += analysis.cost;
    work += analysis.work;
  }
  if (cost > mission.budget) return `调查费用 ${cost} 点超过 ${mission.budget} 点预算。请调整检测或样本数。`;
  if (work > mission.work) return `调查需要 ${work} 格工时，交班前只有 ${mission.work} 格。请调整安排。`;
  return null;
}

export function randomUnit(seed: number, key: string): number {
  let hash = seed >>> 0;
  for (const character of key) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822507) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489909) >>> 0;
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

function batchRate(job: Batch, seed: number): number {
  const draw = randomUnit(seed, `${job.id}:state`);
  let cumulative = 0;
  for (let i = 0; i < job.rates.length; i++) {
    cumulative += job.weights[i];
    if (draw < cumulative) return job.rates[i];
  }
  return job.rates[job.rates.length - 1];
}

export function sampleObservations(job: Batch, seed: number, n: number): boolean[] {
  if (!Number.isInteger(n) || n < 0 || n > job.maxSamples) throw new Error("无效的样本数。");
  const rate = batchRate(job, seed);
  return Array.from({ length: n }, (_, i) => randomUnit(seed, `${job.id}:sample:${i}`) < rate);
}

export function execute(mission: Mission, plans: readonly Plan[]): Result {
  const error = missionError(mission, plans);
  if (error) throw new Error(error);
  const analyses = mission.cases.map((job, i) => analyze(job, plans[i]));
  const outcomes = mission.cases.map((job, i): Outcome => {
    const plan = plans[i];
    const analysis = analyses[i];
    let faults: number;
    let branch: Branch;
    if (job.kind === "device") {
      faults = randomUnit(mission.seed, `${job.id}:fault`) < analysis.fault ? 1 : 0;
      const detector = job.detectors.find((item) => item.id === plan.detectorId);
      const red = detector ? randomUnit(mission.seed, `${job.id}:detector:${detector.id}`) < (faults ? detector.sensitivity : detector.falseAlarm) : true;
      branch = analysis.branches[red ? 0 : 1];
    } else {
      const rate = batchRate(job, mission.seed);
      faults = Array.from({ length: job.count }, (_, j) => randomUnit(mission.seed, `${job.id}:unit:${j}`) < rate).filter(Boolean).length;
      const k = sampleObservations(job, mission.seed, plan.samples).filter(Boolean).length;
      branch = analysis.branches[k];
    }
    const count = job.kind === "batch" ? job.count : 1;
    return { caseId: job.id, observation: branch.label, action: branch.action, faults,
      actual: analysis.cost + (branch.action === "replace" ? count * job.replaceCost : faults * job.faultLoss), posterior: branch.fault };
  });
  const expected = analyses.reduce((sum, item) => sum + item.expected, 0);
  const passed = expected <= mission.goal + 1e-9;
  return { expected, actual: outcomes.reduce((sum, item) => sum + item.actual, 0),
    cost: analyses.reduce((sum, item) => sum + item.cost, 0), work: analyses.reduce((sum, item) => sum + item.work, 0),
    passed, stars: passed ? expected <= mission.efficient + 1e-9 ? 3 : 2 : 0, outcomes };
}
