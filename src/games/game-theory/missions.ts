import type { Mission, Plan, Round } from "./engine.js";

const plan = (deposit = 0, transfer = 0): Plan => ({ contract: true, deposit, transfer, reciprocal: false, action: "cooperate" });
const standard = (title: string, briefing: string, overrides: Partial<Round> = {}): Round => ({
  title, briefing, matrix: [[6, 6], [1, 9], [9, 1], [3, 3]], reserve: [0, 0], outside: [2, 3], fee: 0, ...overrides,
});
export const MISSIONS: readonly Mission[] = [
  {
    id: 1, title: "谁先靠港", concept: "最佳回应 · 占优策略",
    introduction: "清晨的雾还没散，两支船队已经挤在同一条航道。你接手白帆运输，岑舟经营另一支船队。今天没有合同，先算清楚：他怎么走，你怎样回应？",
    teaching: "点开收益表。每格的左数是你赚的金币，右数是岑舟赚的。分别假设岑舟错峰、抢先，比较你两种行动的收益。再提交一次自己的决定。",
    cash: [12, 12], rounds: [standard("第一班潮水", "单次互动，双方分别提交行动，同时揭晓。岑舟在错峰并非严格占优时选择抢先。")],
    contracts: false, transfers: false, goal: 3, cooperation: 0, depositTarget: 0,
    hints: ["分别看收益表的两列，不要只看双方合计。", "对方错峰时，比较 6 和 9；对方抢先时，比较 1 和 3。", "选择抢先靠港：岑舟也会抢先，双方各赚 3。"],
    reference: [{ contract: false, deposit: 0, transfer: 0, reciprocal: false, action: "rush" }],
  },
  {
    id: 2, title: "让约定算数", concept: "纳什均衡 · 可执行承诺",
    introduction: "昨天两边各赚了 3，修船单倒是多了两张。港务员何芮拿来一份合同：双方都交保证金，守约退还，抢先没收。你来定金额。",
    teaching: "勾选港务处合同，调整保证金，观察净收益表。保证金只在签约时冻结；抢先就交给港务处。合法但不够约束违约的合同仍然可以提交。",
    cash: [12, 12], rounds: [standard("共同排班", "让两支船队都愿意守约错峰。这里不计保证金的资金占用成本，违规由港务处准确识别。")],
    contracts: true, transfers: false, goal: 6, cooperation: 1, depositTarget: 4,
    hints: ["比较对方守约时，守约与违约分别净赚多少。", "违约赚 9 − 保证金。岑舟在收益相同时选择抢先。", "签合同，保证金设为 4，按约错峰。双方各赚 6；违约只能赚 5。"],
    reference: [plan(4)],
  },
  {
    id: 3, title: "订单变了", concept: "知识迁移 · 非对称收益",
    introduction: "白帆接到一批鲜货，岑舟的船却装着机器。抢先带来的好处已经不同。何芮把两张新的报价单摊在桌上，这次由你独立排班。",
    cash: [14, 14],
    rounds: [
      standard("鲜货早班", "白帆抢先的额外收入增加。所有收益已经公开。", { matrix: [[7, 6], [1, 9], [11, 1], [3, 3]] }),
      standard("机器晚班", "岑舟的紧急订单让他的违约诱惑变大。", { matrix: [[5, 6], [1, 10], [8, 1], [3, 3]] }),
    ],
    contracts: true, transfers: false, goal: 12, cooperation: 2, depositTarget: 10,
    hints: ["同一笔保证金要同时检查双方的激励。", "早班白帆偏离多赚 4，晚班岑舟偏离多赚 4；相等收益仍可能抢先。", "两班都签合同、保证金 5、按约错峰。总收入 12，累计保证金 10。"],
    reference: [plan(5), plan(5)],
  },
  {
    id: 4, title: "他为何拒签", concept: "参与约束 · 激励约束",
    introduction: "岑舟有了另一条航线，能稳赚 8。旧合同再可靠，他也没有理由放弃那笔收入。你可以从合作收入里分给他一部分，但要重新检查双方会不会违约。",
    cash: [14, 14], rounds: [standard("替代航线", "分账只在双方都错峰时执行。正数表示你付给岑舟；拒签则双方分别走替代航线。", { outside: [2, 8] })],
    contracts: true, transfers: true, goal: 4, cooperation: 1, depositTarget: 6,
    hints: ["先让岑舟愿意加入，再检查双方愿不愿守约。", "他需要至少 8，你最多能转给他 2 才能达到自己的收入目标；这会增加你的违约诱惑。", "分给岑舟 2，保证金 6，签约后错峰。双方赚 4／8；你违约只赚 3。"],
    reference: [plan(6, 2)],
  },
  {
    id: 5, title: "账上不能空", concept: "跨轮规划 · 资金约束",
    introduction: "燃料要先付，保证金也要先冻。你手里的金币只够一份仔细安排过的合同。下一班的订单已经公开，今天省下的空间得撑到明天。",
    cash: [9, 9],
    rounds: [
      standard("先运燃料", "签约前须留 5 金币运营，每方另付 1 金币手续费。", { matrix: [[5, 5], [1, 7], [7, 1], [2, 2]], reserve: [5, 5], fee: 1 }),
      standard("再运冷藏货", "下一班须留 6 金币，违约能抢到 12。上一班收入进入现金账。", { matrix: [[7, 7], [1, 12], [12, 1], [3, 3]], reserve: [6, 6], fee: 1 }),
    ],
    contracts: true, transfers: false, goal: 10, cooperation: 2, depositTarget: 9,
    hints: ["保证金会退还，但签约那一刻仍必须有现金。手续费不会退。", "第一班最多交 3；它赚到的净收入使下一班可以交 6。", "第一班保证金 3，第二班 6；都签约并错峰。净收入 4 + 6 = 10。"],
    reference: [plan(3), plan(6)],
  },
  {
    id: 6, title: "还有下一班吗", concept: "重复博弈 · 偏离收益",
    introduction: "外海的港务处暂时关闭，保证金合同无法执行。岑舟提出长期合作：每班结束有 75% 的概率再来一班。一次抢先之后，双方以后一直抢先。你愿意把这个方案公开写进排班表吗？",
    teaching: "启用长期互惠方案，再比较双方持续合作与偏离一次的期望收益。此关只结算整段关系的期望收益，不抽取随机轮数，也不把它当作已到账金币。",
    cash: [12, 12], rounds: [standard("没有固定终点", "每轮独立以 75% 概率继续，概率与收益保持不变；双方完全观察行动、风险中性且不额外折现。", { continuation: 0.75 })],
    contracts: false, transfers: false, goal: 24, cooperation: 1, depositTarget: 0,
    hints: ["未来损失必须足以盖住眼前多赚的金币。", "合作为 6 ÷ (1 − 0.75)；偏离为 9 + 0.75 × 3 ÷ (1 − 0.75)。", "启用长期互惠，选择错峰。双方合作期望收益 24，偏离一次为 18。"],
    reference: [{ contract: false, deposit: 0, transfer: 0, reciprocal: true, action: "cooperate" }],
  },
  {
    id: 7, title: "最后两班", concept: "有限终局 · 可信承诺",
    introduction: "旧港下周封航，只剩两班。岑舟看着关港公告说：最后一班之后，谁也等不到报复了。何芮恢复了合同窗口，合作要靠眼下能执行的安排。",
    cash: [12, 12], rounds: [
      standard("倒数第二班", "所有人知道还剩两班。手续费每方 1；不能用无限期关系支撑这份排班。", { fee: 1 }),
      standard("最后一班", "明天关港。最后一班没有未来惩罚，合同保证金仍能执行。", { fee: 1 }),
    ],
    contracts: true, transfers: false, goal: 10, cooperation: 2, depositTarget: 8,
    hints: ["从最后一班向前看：什么后果真的还能发生？", "有限终点本身不会自动提供合作激励；每班都要检查保证金。", "两班都签约，保证金 4，选择错峰。每班净赚 5，总计 10。"],
    reference: [plan(4), plan(4)],
  },
  {
    id: 8, title: "整张排班表", concept: "综合挑战 · 合同与经营",
    introduction: "新港试运行。四班货、一次外部报价、有限的周转资金，都交到你手上。岑舟只按公开的合同和收益做决定。何芮收起示范表，等你交出一整班的账。",
    cash: [10, 10], rounds: [
      standard("燃料抵港", "手续费 1，运营周转 6。", { matrix: [[5, 5], [1, 7], [7, 1], [2, 2]], reserve: [6, 6], fee: 1 }),
      standard("急件过潮", "手续费 1，运营周转 7。违约额外赚 5。", { matrix: [[8, 8], [1, 13], [13, 1], [3, 3]], reserve: [7, 7], fee: 1 }),
      standard("争取岑舟", "岑舟替代航线净赚 7。手续费 1，运营周转 8。", { outside: [2, 7], reserve: [8, 8], fee: 1 }),
      standard("平稳收班", "最后一班手续费 1，运营周转 10。按新的收益重新安排保证金。", { reserve: [10, 10], fee: 1 }),
    ],
    contracts: true, transfers: true, goal: 19, cooperation: 4, depositTarget: 19,
    hints: ["先检查每班签约时的现金，再检查参与与偏离，最后合计净收入。", "第三班需要分账 2。分账改变了双方守约收益；它不能在前两班随意照搬。", "保证金依次 3／6／6／4，分账依次 0／0／2／0。都签约错峰，净赚 4 + 7 + 3 + 5 = 19。"],
    reference: [plan(3), plan(6), plan(6, 2), plan(4)],
  },
];

export const MANUAL = [
  ["最佳回应与占优", "固定对方的行动，比较自己所有可选行动；收益最高的是最佳回应。无论对方怎样选，某行动都严格更好，才叫严格占优。本游戏的岑舟在单次互动中仅当错峰严格占优才错峰，否则抢先。这是公开的保守策略，不是通用均衡求解器。"],
  ["纳什均衡", "在一个行动组合中，每一方都无法仅靠自己改变行动提高收益，它就是纳什均衡。均衡不保证总收益最大。标准抢港表中的双方抢先，是低效但稳定的均衡。"],
  ["合同：两个检查", "参与约束检查对方是否愿意加入：合作净收益至少达到替代航线收益。激励约束检查加入之后是否愿意守约：守约收益与单方违约收益比较。满足一个不代表满足另一个。"],
  ["保证金与分账", "签约前每方必须拥有保证金 + 手续费 + 运营周转资金。守约的保证金当班返还，抢先的保证金交给港务处。手续费是消耗，运营周转只是最低余额要求、不再次扣除。分账只在双方错峰时执行，因此会改变违约诱惑。"],
  ["长期互惠", "在收益与独立延续概率 p 恒定的关系中，持续合作期望为 R / (1 − p)，偏离一次、以后相互抢先为 T + pP / (1 − p)。双方都无偏离收益时，触发策略可以维持合作；相互抢先必须本身可作为可信的后续均衡。标准表满足这个条件。p = 0.5 是弱激励边界，并非严格更愿合作。"],
  ["有限终局与模型边界", "标准囚徒困境在固定有限轮次、完全理性且这些条件为共同知识时，会通过逆向归纳瓦解合作。现实可能存在未知类型、误判、执行成本或其他偏好。本游戏公开全部收益、准确识别违约、执行合同无误差，忽略风险偏好与额外折现；不能把游戏结论当成现实谈判的万能规则。"],
] as const;
