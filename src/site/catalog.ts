export interface GameEntry {
  id: string;
  title: string;
  subject: string;
  description: string;
  tags: readonly string[];
  chapters: number;
  chapterLabel?: string;
  href: string;
}

export const GAMES: readonly GameEntry[] = [
  {
    id: "information",
    title: "深空通信站",
    subject: "信息论",
    description: "接下一班深空通信值班。在有限的比特预算里设计码本、修复传输错误，让远方的船队收到回家的指令。",
    tags: ["信息熵", "哈夫曼编码", "纠错码", "策略调度"],
    chapters: 24,
    href: "./games/information/",
  },
  {
    id: "game-theory",
    title: "潮汐港：合约与对手",
    subject: "博弈论",
    description: "你和岑舟共用一条航道，谁都想早点靠港。比较双方收益，定好保证金和分账，用手里的现金安排每一班，让合作划算，也让下一班有钱签约。",
    tags: ["最佳回应", "纳什均衡", "可信承诺", "重复博弈"],
    chapters: 8,
    chapterLabel: "章",
    href: "./games/game-theory/",
  },
  {
    id: "probability",
    title: "检修站：证据与选择",
    subject: "概率与统计推断",
    description: "检测器标红，设备就一定坏了吗？接下街区的检修单，查报告、检查样品，比较先检测和直接更换的损失，决定怎么处理设备。",
    tags: ["条件概率", "贝叶斯更新", "期望损失", "批次推断"],
    chapters: 8,
    chapterLabel: "章",
    href: "./games/probability/",
  },
];
