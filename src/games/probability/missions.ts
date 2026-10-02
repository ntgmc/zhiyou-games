import type { Batch, Detector, Device, Mission, Plan } from "./engine.js";
export const SCREEN: Detector = { id: "screen", name: "快速筛查", sensitivity: 0.9, falseAlarm: 0.05, cost: 1, work: 1 };
export const PRECISE: Detector = { id: "precise", name: "台架复检", sensitivity: 0.95, falseAlarm: 0.01, cost: 3, work: 2 };
const cheap: Detector = { id: "cheap", name: "便携检测", sensitivity: 0.7, falseAlarm: 0.15, cost: 1, work: 1 };
const report = { source: "测量 A-17", title: "初筛原件", detector: SCREEN, red: true };
const device: Device = {
  kind: "device", id: "lamp", title: "学校的投影灯", requester: "许老师",
  request: "下午上课要用这盏灯。请决定要不要检测，以及什么情况下更换。",
  prior: 0.02, evidence: [report], detectors: [PRECISE], replaceCost: 12, faultLoss: 60,
};
const batch: Batch = {
  kind: "batch", id: "switches", title: "工坊的一批开关", requester: "周师傅",
  request: "明天要把这批开关装进 10 台设备。先选检查几件样品，再决定查出多少坏件时更换整批。",
  rates: [0.02, 0.1, 0.3], weights: [0.5, 0.3, 0.2], count: 10, sampleCost: 1, maxSamples: 4, replaceCost: 6, faultLoss: 60,
};
const direct = (action: "keep" | "replace"): Plan => ({ detectorId: "", red: action, green: action, samples: 0, cutoff: 1 });
const test = (id: string): Plan => ({ ...direct("replace"), detectorId: id, green: "keep" });
const sample = (n: number, cutoff: number): Plan => ({ ...direct("keep"), samples: n, cutoff });

export const MISSIONS: readonly Mission[] = [
  {
    id: 1, title: "第一张检修单", concept: "占比与随机结果",
    opening: "许老师把投影灯放到桌上：“备用灯借出去了，帮我看看这盏还能不能用。”罗师傅翻开旧记录，准备带你检查第一台设备。",
    cases: [{ ...device, prior: 0.2, evidence: [], detectors: [SCREEN], replaceCost: 6, faultLoss: 30 }],
    budget: 1, work: 1, goal: 3.8, efficient: 3, seed: 101,
    hints: ["检测器标红和未标红时，可以分别选择更换或保留。", "留下坏灯会损失 30 点。看看标红和未标红两组各有多大可能出故障，再决定怎么处理。", "选择快速筛查，标红就更换，未标红就保留。算上检测费，方案平均损失为 2.92 点。"],
    reference: [test("screen")], recap: "检测有误报，也会漏掉坏灯。分别安排标红和未标红时的处理，能减少平均损失。",
  },
  {
    id: 2, title: "亮红灯的设备", concept: "条件概率与误报",
    opening: "许老师又送来一盏灯：“检测器亮红灯了，这盏一定坏了吗？”罗师傅拿出记录：“先看看被标红的设备里，有多少其实是好的。”",
    cases: [{ ...device, detectors: [] }], budget: 0, work: 0, goal: 12, efficient: 12, seed: 202,
    hints: ["这盏灯已经被标红了。只看标红组，算其中坏灯的占比。", "标红后，灯有故障的概率约为 26.87%。保留的平均损失是 26.87% × 60，约 16.12 点。", "选择直接更换，花 12 点，比保留的平均损失约 16.12 点少。虽然标红不代表一定坏了，这次更换仍更划算。"],
    reference: [direct("replace")], recap: "正常灯很多时，误报也会很多。判断标红的灯有多大可能坏了，要把误报的正常灯一起算进去。",
  },
  {
    id: 3, title: "新报告到站", concept: "先验、后验与证据更新",
    opening: "检测台修好了，可以再测一次。许老师问：“这盏要是好的，能不能不用换？”罗师傅递来检测说明，让你看看复检标红和未标红分别意味着什么。",
    cases: [device], budget: 3, work: 2, goal: 8, efficient: 7, seed: 303,
    hints: ["再测一次后，标红和未标红的灯可以采取不同处理。先比较两种结果下的故障概率。", "复检标红后，故障概率约为 97.21%；复检未标红后，约为 1.82%。", "选择台架复检，标红就更换，未标红就保留。算上 3 点复检费，方案平均损失约为 6.96 点。"],
    reference: [test("precise")], recap: "同一盏灯，复检标红和未标红会让我们作出不同判断。新判断要结合初筛报告和复检效果来算。",
  },
  {
    id: 4, title: "查清还是先修", concept: "期望损失与调查成本",
    opening: "这次得借外部工坊的台架，复检要花 10 点。许老师还在等灯，罗师傅拿来账本：“算算再查一次总共要花多少，和直接换比一比。”",
    cases: [{ ...device, detectors: [{ ...PRECISE, cost: 10 }] }], budget: 10, work: 2, goal: 12.5, efficient: 12, seed: 404,
    hints: ["检测费也算进损失。把复检费加上检测后处理设备的平均损失，再和直接更换比较。", "复检后标红就换、未标红就留，处理设备的平均损失约为 3.96 点，还要加上 10 点检测费。", "不追加检测，直接更换。花 12 点，比复检方案的平均损失约 13.96 点少。"],
    reference: [direct("replace")], recap: "复检的准确程度没变，但费用涨了。加上检测费后，直接更换这次更划算。",
  },
  {
    id: 5, title: "选哪台检测器", concept: "检测效果与处理方案",
    opening: "周师傅搬来一台旧风机：“这批风机常出毛病，换一台也不便宜。”便携检测器和台架都空着，这次由你选用哪一台。",
    cases: [{ ...device, id: "fan", title: "工坊的旧风机", requester: "周师傅", request: "明早要用风机开工。请选检测器，安排什么情况下更换或保留。", prior: 0.4, evidence: [], detectors: [cheap, PRECISE] }],
    budget: 3, work: 2, goal: 10, efficient: 9, seed: 505,
    hints: ["比较两台检测器各会漏掉多少坏设备、误报多少好设备，再看费用。", "便携检测只花 1 点，但会漏掉 30% 的坏风机。留下坏风机会损失 60 点。", "选择台架复检，标红就更换，未标红就保留。方案平均损失为 8.832 点。"],
    reference: [test("precise")], recap: "检测器便宜，却可能漏掉更多坏设备。选工具时，检测费和漏检造成的损失都要算。",
  },
  {
    id: 6, title: "两份一样的报告", concept: "重复报告与新证据",
    opening: "学校交来两张标红报告。你翻到页脚，发现其中一张写着“转录自测量 A-17”。罗师傅说：“先查清它们是不是两次测量，再安排检修。”",
    cases: [{ ...device, evidence: [report, { ...report, title: "办公室转录件" }] }],
    budget: 3, work: 2, goal: 8, efficient: 7, seed: 606,
    hints: ["核对两张报告上的测量编号，看看是不是抄了同一次检测。", "两张都来自测量 A-17，计算时只用一次。台架重新测量，才会提供新的检测结果。", "选择台架复检，标红就更换，未标红就保留。两份初筛报告只算一次，方案平均损失约为 6.96 点。"],
    reference: [test("precise")], recap: "一份报告抄成两份，仍然只测过一次。重复计算会高估证据的作用。",
  },
  {
    id: 7, title: "这一批有多少坏件", concept: "取样与批次推断",
    opening: "周师傅送来一批开关：“生产线有时稳定，有时容易出坏件，这批是哪种情况还不清楚。”实验室能检查同一生产状态下的样品，帮你判断这批开关要不要换。",
    cases: [batch], budget: 4, work: 4, goal: 50, efficient: 48, seed: 707,
    hints: ["样品全好和查出坏件时，可以采取不同处理。只查几件都没坏，还不能保证整批都好。", "更换 10 件开关要花 60 点。比较不取样、取 2 件、取 4 件时，各种结果下保留整批的平均损失。", "检查 4 件样品，至少查出 1 件坏的就更换整批，全部正常就保留。方案平均损失约为 47.63 点。"],
    reference: [sample(4, 1)], recap: "样品让我们更了解这批开关，但查出几件好样品，仍不能保证剩下的全是好的。",
  },
  {
    id: 8, title: "第一次独立值班", concept: "分配检测费用与工时",
    opening: "罗师傅去送修好的灯，桌上还有投影灯、收音机和一批按钮的检修单。交班簿写着今天的预算和工时：“怎么安排，你来定。卡住了就看提示。”",
    cases: [device,
      { ...device, id: "radio", title: "社区的收音机", requester: "陆阿姨", request: "偶尔有杂音，坏了再换也来得及。请和其他检修单一起安排。", prior: 0.05, evidence: [], detectors: [cheap, PRECISE], replaceCost: 8, faultLoss: 20 },
      { ...batch, id: "buttons", title: "工坊的一批按钮", request: "明天要把这批按钮装进 10 台设备。先选检查几件样品，再决定查出多少坏件时更换整批。" }],
    budget: 7, work: 6, goal: 58, efficient: 56, seed: 808,
    hints: ["分别比较每份单直接处理和先调查的平均损失，看看哪份更值得花检测费。", "三份单合用 7 点调查预算、6 格工时。不检测就直接更换或保留，都不占调查工时。", "投影灯用台架复检，标红就换、未标红就留；收音机不检测，直接保留；按钮检查 4 件样品，至少 1 件坏就全换。总平均损失约为 55.58 点。"],
    reference: [test("precise"), direct("keep"), sample(4, 1)], recap: "检测费和工时有限。先比较每份单调查后能减少多少平均损失，再决定查哪几份。",
  },
];
