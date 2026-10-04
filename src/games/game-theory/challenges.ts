import type { Mission, Pair, Plan, Round } from "./engine.js";

export const contract = (deposit: number, transfer = 0): Plan => ({ contract: true, deposit, transfer, reciprocal: false, action: "cooperate" });
export const shipment = (title: string, income: Pair, extra: Pair, reserve: Pair, outside: Pair = [2, 3], fee = 1): Round => ({
  title, briefing: `每方手续费 ${fee} 金币；白帆须留 ${reserve[0]}、岑舟须留 ${reserve[1]} 金币周转。双方错峰的原始收益为 ${income.join(" / ")}，替代航线收益为 ${outside.join(" / ")}。完整行动收益见表。`,
  matrix: [income, [1, income[1] + extra[1]], [income[0] + extra[0], 1], [3, 3]], reserve, outside, fee,
});
export const relationship = (title: string, p: number, matrix: Round["matrix"] = [[6, 6], [1, 9], [9, 1], [3, 3]]): Round => ({
  title, briefing: `这是一段独立合作关系，每班结束以 ${p * 100}% 概率继续，概率和本段收益不变。没有保证金合同。结算整段关系期望，现金不变；下一张报价是另一段关系，互不延续惩罚。`,
  matrix, reserve: [0, 0], outside: [2, 3], fee: 0, continuation: p,
});

export const CHALLENGES: readonly Mission[] = [
  {
    id: 9, title: "分账的另一边", concept: "双向分账 · 激励平衡",
    introduction: "岑舟的冷藏船先靠港更值钱，你的急件则在下一班。两边的违约收入差得很远。何芮把分账栏的负号圈出来：“岑舟也可以分给你，方向看清楚。把两班的账放在一起算。”",
    cash: [16, 16], rounds: [
      shipment("冷藏船先到", [7, 7], [1, 7], [4, 4], [2, 5], 0),
      shipment("白帆运急件", [7, 7], [7, 1], [4, 4], [2, 4], 0),
    ],
    contracts: true, transfers: true, goal: 14, cooperation: 2, depositTarget: 10,
    hints: [
      "分账一改，两边守约与违约的收益差都会变。别只追求这一班自己分得多。",
      "第一班给岑舟 3、第二班由他给你 3，会把双方违约多赚的差额都变成 4；收益相等仍不够。",
      "两班保证金都设 5，分账依次 3／−3，均错峰。白帆收入 4 + 10 = 14，累计保证金 10。",
    ],
    reference: [contract(5, 3), contract(5, -3)],
  },
  {
    id: 10, title: "先给他留钱", concept: "对手现金 · 跨轮约束",
    introduction: "岑舟的船队刚修完船，账上只剩 9。下一班冷藏货要留不少周转金。你可以今天多赚一点，但他明天有没有钱签约，也在这张表里。何芮让你把双方余额都记下来。",
    cash: [12, 9], rounds: [
      shipment("修船后的第一班", [6, 6], [0, 4], [4, 3]),
      shipment("冷藏货压港", [7, 7], [3, 3], [8, 12]),
      shipment("共同收班", [6, 6], [3, 3], [14, 16]),
    ],
    contracts: true, transfers: true, goal: 13, cooperation: 3, depositTarget: 12,
    hints: [
      "一份当前能签、双方愿意守的合同，也可能让下一班的对手签不了。",
      "第二班岑舟至少须有 4 + 1 + 12 = 17。第一班他要净赚至少 8，才能从 9 到 17。",
      "保证金依次 4／4／4，分账 3／0／0，均错峰。白帆净赚 2 + 6 + 5 = 13；第一班后双方现金为 14／17。",
    ],
    reference: [contract(4, 3), contract(4), contract(4)],
  },
  {
    id: 11, title: "担保也要排队", concept: "累计额度 · 分账取舍",
    introduction: "新港的合同越来越多，港务处给这三班分了每方 14 金币的累计担保登记额度。现金够用，也不能每班都交一大笔。何芮拿出登记簿：“钱退回来，登记过的额度可不会跟着退。”",
    cash: [18, 18], rounds: [
      shipment("岑舟的加急单", [6, 6], [1, 5], [4, 4]),
      shipment("白帆的加急单", [6, 6], [5, 1], [4, 4]),
      shipment("普通货交班", [6, 6], [3, 3], [4, 4]),
    ],
    contracts: true, transfers: true, goal: 15, cooperation: 3, depositLimit: 14, depositTarget: 12,
    hints: [
      "同时算你的收入和每班登记多少保证金。额度按已接受的合同累计，不是当前冻结的现金。",
      "不分账时，三班最少要登记 6 + 6 + 4 = 16，超过上限。分账能降低一边的违约诱惑，但也会改变你的收入。",
      "保证金 4／4／4，分账 2／−2／0，均错峰。收入 3 + 7 + 5 = 15，累计登记 12，留下 2 额度。",
    ],
    reference: [contract(4, 2), contract(4, -2), contract(4)],
  },
  {
    id: 12, title: "不是每条线都长久", concept: "延续概率 · 最佳回应",
    introduction: "岑舟拿来三条外海航线的长期报价。有的常来常往，有的很快就没了下一班。每条都算一段独立关系，不共用账目或惩罚。何芮把三份报价摊开，合同窗口仍然关闭，你来决定每段关系怎样开始。",
    cash: [12, 12], rounds: [
      relationship("临时航线", 0.25),
      relationship("季节航线", 0.5),
      relationship("常年航线", 0.75),
    ],
    contracts: false, transfers: false, goal: 40, cooperation: 2, depositTarget: 0,
    hints: [
      "分别检查每条航线的合作期望和单独偏离期望。约定名字相同，延续概率不一定支持相同的行为。",
      "25% 时合作期望 8、偏离 10，长期互惠不能维持合作；50% 时都是 12，75% 时合作 24、偏离 18。",
      "第一条不启用长期互惠，选择抢先，期望 4；后两条启用长期互惠并错峰，期望 12、24。合计 40，两段稳定合作；现金仍为 12／12。",
    ],
    reference: [
      { contract: false, deposit: 0, transfer: 0, reciprocal: false, action: "rush" },
      { contract: false, deposit: 0, transfer: 0, reciprocal: true, action: "cooperate" },
      { contract: false, deposit: 0, transfer: 0, reciprocal: true, action: "cooperate" },
    ],
  },
  {
    id: 13, title: "两本账一起算", concept: "综合排班 · 双方资金",
    introduction: "新港第一次接六班联运，岑舟带着自己的账簿来交接。冷藏船、机器和普通货轮流走，两边手里的钱并不一样。何芮给本章每方 31 的累计担保额度，六班都要形成稳定合作。",
    cash: [14, 10], rounds: [
      shipment("先运周转货", [6, 6], [0, 4], [4, 4]),
      shipment("冷藏船候潮", [7, 7], [3, 3], [8, 13]),
      shipment("白帆运机器", [7, 8], [7, 1], [12, 14], [2, 4]),
      shipment("岑舟的加急船", [8, 6], [1, 7], [22, 20], [2, 8]),
      shipment("机器卸完再走", [6, 8], [6, 2], [28, 28]),
      shipment("冷库交班", [8, 7], [2, 6], [33, 33]),
    ],
    contracts: true, transfers: true, goal: 33, cooperation: 6, depositLimit: 31, depositTarget: 28,
    hints: [
      "每班都记录双方现金和剩余额度。不要只为白帆计算下一班能签多少。",
      "第二班岑舟须有至少 18。第四班另一条航线报价 8；第三班的分账方向会影响这时双方手上的钱。",
      "保证金 4／4／5／5／5／5，分账 3／0／−3／3／−2／2，均错峰。收入 33，累计担保 28。",
    ],
    reference: [contract(4, 3), contract(4), contract(5, -3), contract(5, 3), contract(5, -2), contract(5, 2)],
  },
  {
    id: 14, title: "潮水两次转向", concept: "综合排班 · 局部与全程",
    introduction: "八班船要跨过两次潮水交替，部分班次的合同手续费也涨了。岑舟把别处的报价夹在订单中，何芮把累计担保上限写成 46。你得留出后面签约的钱，收入也要够交班。",
    cash: [15, 15], rounds: [
      shipment("岑舟运冰鲜", [6, 7], [1, 5], [8, 8]),
      shipment("白帆运零件", [8, 6], [6, 2], [12, 17]),
      shipment("过潮前的急件", [7, 8], [2, 8], [18, 17], [2, 9], 2),
      shipment("过潮后的机器", [9, 7], [8, 2], [20, 28]),
      shipment("双船卸货", [8, 8], [4, 6], [32, 30], [2, 7], 2),
      shipment("岑舟接新报价", [6, 8], [2, 6], [36, 39], [2, 9]),
      shipment("白帆的末班急件", [8, 7], [7, 3], [39, 47]),
      shipment("两边一起交班", [9, 9], [4, 4], [50, 51], [2, 3], 2),
    ],
    contracts: true, transfers: true, goal: 49, cooperation: 8, depositLimit: 46, depositTarget: 43,
    hints: [
      "对照整章总表，把收入目标、双方余额和累计担保放在一起核算。手续费不能漏算。",
      "第二、第五和第八班签约时，双方周转要求同时很紧。第三班与第六班的替代航线还限制了分账下限。",
      "保证金 4／5／6／6／6／5／6／5，分账 2／−2／3／−3／1／2／−2／0，均错峰。收入 49，累计担保 43。",
    ],
    reference: [contract(4, 2), contract(5, -2), contract(6, 3), contract(6, -3), contract(6, 1), contract(5, 2), contract(6, -2), contract(5)],
  },
  {
    id: 15, title: "交班前的十张单", concept: "综合排班 · 多步约束",
    introduction: "接班员到了，桌上还有十张订单。岑舟要按顺序运完自己的货，不能跳过其中难签的一班。何芮留下 55 的累计担保额度，让你把十班收入和两边余额都留给接班员。",
    cash: [16, 13], rounds: [
      shipment("外海冷藏船", [7, 7], [1, 7], [8, 6], [2, 9]),
      shipment("白帆的修船件", [8, 7], [7, 1], [13, 16]),
      shipment("潮头加急", [8, 8], [3, 7], [20, 16], [2, 9]),
      shipment("机器晚到", [7, 9], [6, 2], [26, 27], [2, 4], 2),
      shipment("岑舟再收报价", [9, 8], [2, 8], [33, 32], [2, 9]),
      shipment("白帆抢早班", [8, 9], [8, 2], [36, 41], [2, 4], 2),
      shipment("共同卸货", [7, 8], [4, 4], [49, 46], [2, 6]),
      shipment("补运冷库货", [9, 7], [1, 5], [55, 55], [2, 8]),
      shipment("最后一批零件", [8, 9], [6, 2], [60, 59], [2, 4], 2),
      shipment("接班员核账", [10, 10], [3, 5], [68, 66], [2, 8], 2),
    ],
    contracts: true, transfers: true, goal: 66, cooperation: 10, depositLimit: 55, depositTarget: 52,
    hints: [
      "有些分账现在少赚，却能换来后面足够的现金；也有些多余分账会让白帆自己缺钱。按顺序记下每次变化。",
      "第一班以后岑舟须有 22。第六班、第八班和最后一班都要回看前面的累计分账，检查谁的现金不足。",
      "保证金 5／5／6／5／6／6／5／4／5／5，分账 3／−3／2／−2／3／−3／0／2／−2／1，均错峰。收入 66，累计担保 52。",
    ],
    reference: [contract(5, 3), contract(5, -3), contract(6, 2), contract(5, -2), contract(6, 3), contract(6, -3), contract(5), contract(4, 2), contract(5, -2), contract(5, 1)],
  },
  {
    id: 16, title: "一整天的航道", concept: "综合经营 · 完整排班",
    introduction: "新港全天开放，十六班货从早潮一直排到夜里。岑舟把自己的余额写在表头，何芮交给你每方 98 的累计担保登记额度，随后去码头巡查。你接管整条航道，交班前每一班都要稳定合作，收入至少 112。",
    cash: [14, 11], rounds: [
      shipment("早潮周转货", [6, 6], [0, 6], [7, 5]),
      shipment("两队出早班", [8, 7], [4, 4], [10, 13]),
      shipment("白帆的急修件", [9, 8], [8, 2], [14, 16], [2, 4]),
      shipment("岑舟的冷藏箱", [8, 8], [2, 8], [25, 21], [2, 9], 2),
      shipment("第一轮交接", [7, 9], [6, 2], [29, 32], [2, 4]),
      shipment("下午冷库备货", [9, 7], [1, 7], [37, 37], [2, 8]),
      shipment("白帆补运零件", [8, 9], [7, 1], [42, 47], [2, 4], 2),
      shipment("双船换班", [8, 8], [3, 5], [52, 50]),
      shipment("岑舟的远海订单", [10, 9], [2, 10], [55, 57], [2, 11], 2),
      shipment("白帆的远海急件", [9, 10], [10, 2], [60, 67], [2, 5]),
      shipment("晚潮冷藏船", [10, 8], [4, 8], [70, 72], [2, 8], 2),
      shipment("白帆转运机器", [8, 10], [8, 4], [77, 81], [2, 6]),
      shipment("第二轮交接", [9, 9], [5, 5], [88, 88], [2, 3], 2),
      shipment("岑舟赶末班", [8, 9], [1, 7], [95, 97], [2, 10]),
      shipment("白帆的夜间急件", [11, 8], [9, 3], [98, 103], [2, 3], 2),
      shipment("夜班核账", [10, 10], [4, 6], [111, 109], [2, 8], 2),
    ],
    contracts: true, transfers: true, goal: 112, cooperation: 16, depositLimit: 98, depositTarget: 95,
    hints: [
      "先整理整章总表，在签约紧张的班次倒着核算所需余额，再向前核对参与、违约和累计担保。单班赚得最多不一定能走到夜班。",
      "第七班之前岑舟须有 54，第十三班之前白帆须有 96。为了到达这两个余额，前一班的分账可能偏离最省保证金的选择。最后一班也须同时满足双方周转要求。",
      "保证金依次 4／5／6／6／5／6／5／5／7／7／7／8／6／5／7／6；分账 3／0／−3／3／−2／4／−3／1／4／−4／2／−3／0／3／−3／1。均签约错峰，净赚 112，累计担保 95，最后现金 126／126。",
    ],
    reference: [contract(4, 3), contract(5), contract(6, -3), contract(6, 3), contract(5, -2), contract(6, 4), contract(5, -3), contract(5, 1), contract(7, 4), contract(7, -4), contract(7, 2), contract(8, -3), contract(6), contract(5, 3), contract(7, -3), contract(6, 1)],
  },
];
