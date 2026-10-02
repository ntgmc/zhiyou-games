export interface GameEntry {
  id: string;
  title: string;
  subject: string;
  description: string;
  tags: readonly string[];
  chapters: number;
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
];
