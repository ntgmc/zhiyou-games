import type { Edge, Mission, Place, Route } from "./engine.js";

const place = (id: string, name: string, x: number, y: number, need?: number, reply?: string): Place => ({ id, name, x, y, need, reply });
const edge = (from: string, to: string, capacity: number, cost = 1): Edge => ({ id: `${from}${to}`, from, to, capacity, cost });
const route = (nodes: string, amount: number): Route => ({ nodes: nodes.split(""), amount });
const four = (need: number): Place[] => [
  place("S", "总仓", 10, 50), place("A", "北站", 40, 20), place("B", "南站", 40, 80),
  place("T", "河岸站", 88, 50, need, "河岸站的补给架重新摆满，晚班人员可以接着分发。"),
];
const five = (need: number): Place[] => [
  place("S", "总仓", 9, 50), place("A", "北站", 32, 20), place("B", "南站", 32, 80),
  place("C", "桥头站", 62, 50), place("T", "河岸站", 90, 50, need, "桥那头已经收到补给，河岸站恢复了今天的分发。"),
];

export const MISSIONS: readonly Mission[] = [
  {
    id: 1, title: "第一箱补给", concept: "地点、方向与路线",
    opening: "河岸站的周姨：雨停了，站里的补给还没接上。先送一箱过来吧，北站有人帮忙转运。",
    places: [place("S", "总仓", 12, 50), place("A", "北站", 50, 30),
      place("T", "河岸站", 88, 50, 1, "周姨接过第一箱补给，腾出桌子开始分发。")],
    edges: [edge("S", "A", 4, 0), edge("A", "T", 4, 0)],
    source: "S", supply: 1, budget: 0, efficient: 0, reference: [route("SAT", 1)],
    hints: ["沿着箭头看看总仓与河岸站如何相连。", "先到北站，再转到河岸站。选好路线还要把箱子加入草案。", "选择总仓 → 北站 → 河岸站，加入 1 箱，再执行运输。"],
    recap: "路线要按通道的方向，把出发点和接收点连起来。",
  },
  {
    id: 2, title: "近路的账单", concept: "带权最短路径",
    opening: "周姨：又来了一箱。临时直达通道能走，但费用高。今天这箱运输只能花 3 点。",
    places: four(1),
    edges: [edge("S", "T", 1, 8), edge("S", "A", 1, 1), edge("A", "T", 1, 2),
      edge("S", "B", 1, 2), edge("B", "T", 1, 3)],
    source: "S", supply: 1, budget: 10, costGoal: 3, efficient: 3, reference: [route("SAT", 1)],
    hints: ["比较整条路线的费用，别只数经过几个地点。", "每箱走一路段付一次费用。北站方向是 1 + 2 点，直达是 8 点。", "经北站送 1 箱，总费用 3 点。10 点是可执行预算，本章通过目标是最多花 3 点。"],
    recap: "最短路径在这里比较费用之和，经过的路段少不一定省钱。",
  },
  {
    id: 3, title: "桥上的限额", concept: "容量与流量守恒",
    opening: "周姨：这次要补齐 4 箱。两座临时桥每班各只能过 2 箱，一条路线装不下全部。",
    places: four(4),
    edges: [edge("S", "A", 3), edge("A", "T", 2), edge("S", "B", 3), edge("B", "T", 2)],
    source: "S", supply: 5, budget: 20, efficient: 8, reference: [route("SAT", 2), route("SBT", 2)],
    hints: ["沿路线逐段检查，一段装不下，整条路线就装不下。", "进入北站、南站的通道各能过 3 箱，出站的桥却只能各过 2 箱。", "经北站送 2 箱，经南站送 2 箱，合计 4 箱、8 点。"],
    recap: "一条路线能再安排多少箱，受沿途剩余容量最小的通道限制。",
  },
  {
    id: 4, title: "两边一起送", concept: "拆分运输与最大流",
    opening: "周姨：河岸站今天需要 6 箱。桥头能转运，北站还有一条直达通道，你来安排它们怎么配合。",
    places: five(6),
    edges: [edge("S", "A", 5), edge("S", "B", 4), edge("A", "C", 3), edge("A", "T", 2, 3),
      edge("B", "C", 4), edge("C", "T", 4)],
    source: "S", supply: 9, budget: 30, efficient: 20, reference: [route("SAT", 2), route("SBCT", 4)],
    hints: ["两条路线经过同一座桥时，共同使用桥的容量。", "桥头 → 河岸站最多 4 箱，北站 → 河岸站最多 2 箱。两处都用上才能补齐 6 箱。", "总仓 → 北站 → 河岸站送 2 箱；总仓 → 南站 → 桥头站 → 河岸站送 4 箱，费用 20 点。"],
    recap: "把多条路线配合起来，才能用足网络的运输能力。",
  },
  {
    id: 5, title: "改一张调度单", concept: "残量网络与反向调整",
    opening: "运输站的许衡：上一班留下的草案把 3 箱都排成了总仓 → 北站 → 南站 → 河岸站。这些箱子还没发出，接收站却需要 6 箱。试着改改这张单。",
    places: four(6),
    edges: [edge("S", "A", 3, 1), edge("S", "B", 3, 2), edge("A", "B", 3, 0),
      edge("A", "T", 3, 2), edge("B", "T", 3, 1)],
    source: "S", supply: 6, budget: 24, efficient: 18, seed: [route("SABT", 3)],
    reference: [route("SAT", 3), route("SBT", 3)],
    hints: ["暂时走不通，可以检查哪些旧安排能撤回。", "调整路径中的南站 → 北站表示减少北站 → 南站的草案安排；它不是一条真实的逆向通道。", "切到调整草案，选择总仓 → 南站 → 撤回到北站 → 河岸站，调整 3 箱。得到北站方向 3 箱、南站方向 3 箱，共 18 点。"],
    recap: "撤回一段尚未执行的安排，再与新通道组合，可以增加总交付量。",
  },
  {
    id: 6, title: "五箱的上限", concept: "割、最小割与最大流",
    opening: "许衡：仓里有 10 箱，这班能送到河岸站的最多却只有 5 箱。安排运输后，还要勾选分界两侧的地点，说明为什么送不了第 6 箱。",
    places: five(5),
    edges: [edge("S", "A", 6), edge("S", "B", 4), edge("A", "C", 3),
      edge("B", "C", 2), edge("C", "T", 6)],
    source: "S", supply: 10, budget: 30, efficient: 15, certificate: true,
    reference: [route("SACT", 3), route("SBCT", 2)], referenceCut: ["S", "A", "B"],
    hints: ["把总仓和接收点分到两侧，检查所有从总仓侧跨到另一侧的通道。", "桥头前的两条通道容量合计 3 + 2；仅圈总仓得到 10，还不是最紧的上限。", "经北站、桥头送 3 箱，经南站、桥头送 2 箱。总仓侧选择总仓、北站、南站，分界容量 5 箱，费用 15 点。"],
    recap: "送到的箱数与分界容量相等，就同时证明了方案可行和运输量已经最大。",
  },
  {
    id: 7, title: "独立交班", concept: "独立挑战 · 运输方案与上限证明",
    opening: "许衡：这次路网多了两个中转点。河岸站需要 8 箱，你来安排，并给下一班留一份能核对的运输上限证明。条件都在图和通道表里。",
    places: [
      place("S", "总仓", 8, 50), place("A", "北站", 32, 18), place("B", "南站", 32, 50),
      place("C", "坡口站", 32, 82), place("D", "上桥头", 63, 25), place("E", "下桥头", 63, 75),
      place("T", "河岸站", 91, 50, 8, "周姨收到 8 箱补给，交班单上也写清了本班的运输上限。"),
    ],
    edges: [edge("S", "A", 5), edge("S", "B", 4), edge("S", "C", 3, 2), edge("A", "D", 3),
      edge("A", "E", 2), edge("B", "D", 3), edge("B", "E", 2, 2), edge("C", "E", 2),
      edge("D", "T", 4), edge("E", "T", 4), edge("E", "D", 2)],
    source: "S", supply: 12, budget: 40, efficient: 26, certificate: true,
    reference: [route("SADT", 3), route("SAET", 2), route("SBDT", 1), route("SBET", 2)],
    referenceCut: ["S", "A", "B", "C", "D", "E"],
    hints: ["同时检查各接收通道和进入中转点的通道，运输量与费用可以分开比较。", "接收站前两条通道各能过 4 箱。给出 8 箱的可行方案，再找容量为 8 的分界。", "经北站、上桥头送 3 箱；经北站、下桥头送 2 箱；经南站、上桥头送 1 箱；经南站、下桥头送 2 箱。总仓侧选除河岸站外的所有地点，费用 26 点。"],
    recap: "上限证明检查整个分界，运输草案还要逐条满足通道容量。",
  },
  {
    id: 8, title: "两个街区都在等", concept: "独立挑战 · 多接收点与费用分配",
    opening: "周姨：河岸站要 6 箱，山脚站要 5 箱。两边共用桥头的通道，今天一共能花 48 点。每一站都得收到自己的那份。",
    places: [
      place("S", "总仓", 8, 50), place("A", "北站", 32, 20), place("B", "南站", 32, 80),
      place("C", "桥头站", 62, 30), place("D", "坡道站", 62, 82),
      place("T", "河岸站", 91, 20, 6, "周姨收到 6 箱，河岸站按原定数量开始分发。"),
      place("U", "山脚站", 91, 75, 5, "山脚站收到 5 箱，两边的晚班都接上了供应。"),
    ],
    edges: [edge("S", "A", 6), edge("S", "B", 6), edge("A", "C", 4), edge("A", "T", 2, 3),
      edge("B", "C", 3), edge("B", "D", 3, 2), edge("C", "T", 4), edge("C", "U", 3, 2),
      edge("D", "U", 3), edge("B", "U", 2, 6)],
    source: "S", supply: 12, budget: 48, efficient: 40,
    reference: [route("SAT", 2), route("SACT", 4), route("SBCU", 3), route("SBDU", 2)],
    hints: ["按每个接收点的需求核对，不要只看总箱数。", "河岸站入口容量是 2 + 4，必须用足。山脚站有几条选择，注意共用北站、南站和桥头的剩余容量。", "经北站直达河岸站 2 箱，经北站、桥头到河岸站 4 箱；经南站、桥头到山脚站 3 箱，经南站、坡道到山脚站 2 箱。两站收到 6 与 5 箱，费用 40 点。"],
    recap: "共享通道的容量要一起算，交付目标则要按每个接收点分别核对。",
  },
];
