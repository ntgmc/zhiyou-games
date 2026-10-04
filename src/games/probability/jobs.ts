import type { Action, Batch, Detector, Device, Plan } from "./engine.js";

export const SCREEN: Detector = { id: "screen", name: "快速筛查", sensitivity: 0.9, falseAlarm: 0.05, cost: 1, work: 1 };
export const PRECISE: Detector = { id: "precise", name: "台架复检", sensitivity: 0.95, falseAlarm: 0.01, cost: 3, work: 2 };
export const cheap: Detector = { id: "cheap", name: "便携检测", sensitivity: 0.7, falseAlarm: 0.15, cost: 1, work: 1 };
export const report = { source: "测量 A-17", title: "初筛原件", detector: SCREEN, red: true };
export const device: Device = {
  kind: "device", id: "lamp", title: "学校的投影灯", requester: "许老师",
  request: "下午上课要用这盏灯。请决定要不要检测，以及什么情况下更换。",
  prior: 0.02, evidence: [report], detectors: [PRECISE], replaceCost: 12, faultLoss: 60,
};
export const batch: Batch = {
  kind: "batch", id: "switches", title: "工坊的一批开关", requester: "周师傅",
  request: "明天要把这批开关装进 10 台设备。先选检查几件样品，再决定查出多少坏件时更换整批。",
  rates: [0.02, 0.1, 0.3], weights: [0.5, 0.3, 0.2], count: 10, sampleCost: 1, maxSamples: 4, replaceCost: 6, faultLoss: 60,
};
export const direct = (action: Action): Plan => ({ detectorId: "", red: action, green: action, samples: 0, cutoff: 1 });
export const test = (id: string): Plan => ({ ...direct("replace"), detectorId: id, green: "keep" });
export const sample = (n: number, cutoff: number): Plan => ({ ...direct("keep"), samples: n, cutoff });
