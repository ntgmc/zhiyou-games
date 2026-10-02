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
    description: "经营白帆运输，与另一支船队共享港口。推演对手的收益，制定保证金与分账合同，在有限现金中交出稳定合作的排班表。",
    tags: ["最佳回应", "纳什均衡", "可信承诺", "重复博弈"],
    chapters: 8,
    chapterLabel: "章",
    href: "./games/game-theory/",
  },
];
