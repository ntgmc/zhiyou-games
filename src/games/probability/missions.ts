import type { Batch, Detector, Device, Mission, Plan } from "./engine.js";
export const SCREEN: Detector = { id: "screen", name: "快速筛查", sensitivity: 0.9, falseAlarm: 0.05, cost: 1, work: 1 };
export const PRECISE: Detector = { id: "precise", name: "台架复检", sensitivity: 0.95, falseAlarm: 0.01, cost: 3, work: 2 };
const cheap: Detector = { id: "cheap", name: "便携检测", sensitivity: 0.7, falseAlarm: 0.15, cost: 1, work: 1 };
const report = { source: "测量 A-17", title: "初筛原件", detector: SCREEN, red: true };
const device: Device = {
  kind: "device", id: "lamp", title: "学校的投影灯", requester: "许老师",
  request: "下午的课还要用这盏灯。请安排检测和处置，留下一张能交给同事的检修单。",
  prior: 0.02, evidence: [report], detectors: [PRECISE], replaceCost: 12, faultLoss: 60,
};
const batch: Batch = {
  kind: "batch", id: "switches", title: "工坊的一批开关", requester: "周师傅",
  request: "明天要装进 10 台设备。请先决定取多少件同来源样品，再安排出现不同坏件数时如何处置。",
  rates: [0.02, 0.1, 0.3], weights: [0.5, 0.3, 0.2], count: 10, sampleCost: 1, maxSamples: 4, replaceCost: 6, faultLoss: 60,
};
const direct = (action: "keep" | "replace"): Plan => ({ detectorId: "", red: action, green: action, samples: 0, cutoff: 1 });
const test = (id: string): Plan => ({ ...direct("replace"), detectorId: id, green: "keep" });
const sample = (n: number, cutoff: number): Plan => ({ ...direct("keep"), samples: n, cutoff });

export const MISSIONS: readonly Mission[] = [
  {
    id: 1, title: "第一张检修单", concept: "占比与随机结果",
    opening: "许老师把一盏灯放到桌上：“备用灯已经借出去了，帮我看看这盏还能不能用。”罗师傅让你先翻开同类设备的记录。",
    cases: [{ ...device, prior: 0.2, evidence: [], detectors: [SCREEN], replaceCost: 6, faultLoss: 30 }],
    budget: 1, work: 1, goal: 3.8, efficient: 3, seed: 101,
    hints: ["检测后可以安排两种处置，不必让所有设备都走同一条路。", "保留故障灯的损失是 30 点。比较标红和未标红两组的故障占比。", "选快速筛查；标红时更换，未标红时保留。方案期望总损失为 2.92 点。"],
    reference: [test("screen")], recap: "同类设备的故障占比能帮助判断风险，一次实际结果仍可能与平均情况不同。",
  },
  {
    id: 2, title: "亮红灯的设备", concept: "条件概率与误报",
    opening: "许老师又送来一盏灯：“这次检测器亮红灯了，是不是就得换？”罗师傅取出检测器的校准记录：“先数一数，红灯里面有多少正常设备。”",
    cases: [{ ...device, detectors: [] }], budget: 0, work: 0, goal: 12, efficient: 12, seed: 202,
    hints: ["先把已经标红的设备筛出来，判断只针对这一组。", "标红组的故障概率约 26.87%；保留的期望损失为这个概率乘 60。", "直接更换。12 点低于保留的约 16.12 点期望损失；红灯本身仍不代表必有故障。"],
    reference: [direct("replace")], recap: "标红组里的故障占比，要同时考虑故障本来有多常见和检测器的误报。",
  },
  {
    id: 3, title: "新报告到站", concept: "先验、后验与证据更新",
    opening: "台架复检恢复使用了。许老师问：“再测一次，能不能少换一盏正常灯？”罗师傅递来复检说明，让你先试两种可能的结果。",
    cases: [device], budget: 3, work: 2, goal: 8, efficient: 7, seed: 303,
    hints: ["新检测可能改变后续处置。把标红和未标红都试一遍。", "复检标红后的故障概率约 97.21%，未标红后约 1.82%。", "台架复检；标红更换，未标红保留。包括复检费，期望总损失约 6.96 点。"],
    reference: [test("precise")], recap: "把已有判断与新检测的效果一起计算，才能得到加入这份证据后的故障概率。",
  },
  {
    id: 4, title: "查清还是先修", concept: "期望损失与调查成本",
    opening: "台架要占用外部工坊，这次复检收费 10 点。许老师还在等灯，罗师傅让你把“再查”与“现在更换”都记到账上。",
    cases: [{ ...device, detectors: [{ ...PRECISE, cost: 10 }] }], budget: 10, work: 2, goal: 12.5, efficient: 12, seed: 404,
    hints: ["调查本身也有代价。比较整套方案，不能只看检测后的风险。", "复检后按红灯更换、非红灯保留，期望处置损失约 3.96 点，另付 10 点调查费。", "直接更换，损失 12 点；追加复检方案约 13.96 点。"],
    reference: [direct("replace")], recap: "同样的证据更新，调查费用变了，值得采取的行动也可能改变。",
  },
  {
    id: 5, title: "选哪台检测器", concept: "工具效果与分支决策",
    opening: "周师傅搬来一台旧风机：“这一批常出故障，但也不能见一台换一台。”便携检测器和台架都空着，这次由你选择。",
    cases: [{ ...device, id: "fan", title: "工坊的旧风机", requester: "周师傅", request: "请选检测工具并安排处置，明早要重新开工。", prior: 0.4, evidence: [], detectors: [cheap, PRECISE] }],
    budget: 3, work: 2, goal: 10, efficient: 9, seed: 505,
    hints: ["检查每个工具在故障和正常设备上的表现。", "便携检测便宜，但会漏掉 30% 的故障设备。保留故障的损失也要算。", "台架复检；标红更换，未标红保留。期望总损失为 8.832 点。"],
    reference: [test("precise")], recap: "工具是否划算，取决于检测效果、费用，以及漏掉故障会造成的损失。",
  },
  {
    id: 6, title: "两份一样的报告", concept: "证据来源与独立条件",
    opening: "学校交来两张标红报告。你翻到页脚，发现其中一张写着“转录自测量 A-17”。罗师傅说：“先查清它们是不是两次测量，再安排检修。”",
    cases: [{ ...device, evidence: [report, { ...report, title: "办公室转录件" }] }],
    budget: 3, work: 2, goal: 8, efficient: 7, seed: 606,
    hints: ["查两张报告的测量编号。", "两张都来自 A-17，只能计一次。独立台架复检才会新增证据。", "台架复检；标红更换，未标红保留。两份初筛文件计一次，方案约 6.96 点。"],
    reference: [test("precise")], recap: "同一测量的转录件没有增加新证据，报告数量不能代替测量来源。",
  },
  {
    id: 7, title: "这一批有多少坏件", concept: "取样与批次推断",
    opening: "周师傅送来一批开关：“生产线可能在三种状态中的一种，我们还不知道是哪种。实验室能检查同来源的样品，检查完再决定这批怎么用。”",
    cases: [batch], budget: 4, work: 4, goal: 50, efficient: 48, seed: 707,
    hints: ["安排不同坏件数下的处置。没有查出坏件，也不能认定故障率为零。", "更换全部花 60 点。比较 0、2、4 件样品下，各结果的平均故障率和预计损失。", "取 4 件样品；查出至少 1 件坏件就更换全批，否则保留。期望总损失约 47.63 点。"],
    reference: [sample(4, 1)], recap: "样品会改变对生产状态的判断，有限样品仍会留下不确定性。",
  },
  {
    id: 8, title: "第一次独立值班", concept: "共享资源下的调查规划",
    opening: "罗师傅去送修好的灯，桌上还有两份设备单和一批开关。他在交班簿写下预算与工时：“条件都在这里，今天的安排交给你。需要帮助时再翻提示。”",
    cases: [device,
      { ...device, id: "radio", title: "社区的收音机", requester: "陆阿姨", request: "偶尔有杂音，坏了再换也来得及。请和其他检修单一起安排。", prior: 0.05, evidence: [], detectors: [cheap, PRECISE], replaceCost: 8, faultLoss: 20 },
      { ...batch, id: "buttons", title: "工坊的一批按钮" }],
    budget: 7, work: 6, goal: 58, efficient: 56, seed: 808,
    hints: ["先比较每份任务追加调查能减少多少预计损失，再分配共享费用和工时。", "全部任务共同使用 7 点调查预算、6 格工时；直接处置不占调查工时。", "投影灯台架复检，标红换、未标红留；收音机直接留；按钮取 4 件，至少 1 件坏就全换。期望总损失约 55.58 点。"],
    reference: [test("precise"), direct("keep"), sample(4, 1)], recap: "共享预算下，需要比较调查对每份任务的作用，再决定把资源用在哪里。",
  },
];
