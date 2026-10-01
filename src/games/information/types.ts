export type Codebook = Record<string, string>;
export type Counts = Record<string, number>;
export type Protection = "none" | "repeat" | "hamming";
export type Coding = "fixed" | "custom";
export type TaskState = "pending" | "delivered" | "failed" | "expired";
export type Status = "playing" | "won" | "lost";

export type Noise = {
  label: string;
  detail: string;
  strength: number;
} & ({ type: "none" | "single" } | { type: "blocks"; blockSize: number });

export interface Packet {
  id: string;
  name: string;
  tokens: string[];
  deadline: number;
  required: boolean;
  priority: string;
  description: string;
  releaseRound?: number;
  value?: number;
}

export interface Mission {
  id: number;
  chapter: string;
  title: string;
  destination: string;
  kicker: string;
  concept: string;
  budget: number;
  rounds: number;
  parBits: number;
  noise: Noise;
  protections: Protection[];
  packets: Packet[];
  objective: string;
  briefing: string;
  hint: string;
  takeaway: string;
  lesson: string;
  accent: string;
  independent?: boolean;
  difficulty?: string;
  hints?: string[];
  totalBudget?: number;
  initialCoding?: Coding;
  initialCodes?: Codebook;
  receiverCodes?: Codebook;
  initialProtection?: Protection;
  initialSelected?: string[];
  syncCost?: number;
  windows?: { budget: number; noise: Noise; label?: string }[];
}

export interface HuffmanNode {
  id: string;
  symbol?: string;
  weight: number;
  order: number;
  left?: HuffmanNode;
  right?: HuffmanNode;
}

export interface PacketResult {
  id: string;
  name: string;
  tokens: string[];
  sourceBits: string;
  transmittedBits: string;
  receivedBits: string;
  flipPositions: number[];
  decodedBits: string;
  receivedTokens: string[];
  blocks: { received: string; data: string; corrected: string; syndrome: number; checks?: number[] }[];
  correctedBlocks: number;
  tokenErrors: number;
  padding: number;
  delivered: boolean;
  cost: number;
}

export interface RoundResult {
  round: number;
  codes: Codebook;
  coding?: Coding;
  protection: Protection;
  syncBits: number;
  totalBits: number;
  budget: number;
  noise: Noise;
  skipped: boolean;
  packets: PacketResult[];
  expired: string[];
  taskStates?: Record<string, TaskState>;
}

export interface Guide {
  version: number;
  intro: number;
  phase: number;
  demo: string | null;
  quiz: string | null;
  skipped: boolean;
}

export interface Session {
  missionId: number;
  round: number;
  coding: Coding;
  customCodes: Codebook;
  receiverCodes: Codebook;
  protection: Protection;
  selectedIds: string[];
  taskStates: Record<string, TaskState>;
  history: RoundResult[];
  totalBits: number;
  status: Status;
  stars: number;
  guide?: Guide;
  hintLevel?: number;
}

export type GuidedSession = Session & { guide: Guide; hintLevel: number };

export interface Progress {
  unlocked: number;
  best: Record<string, number>;
  soloBest: Record<string, number>;
  lessons: string[];
  consoleMode?: boolean;
}

export interface Lesson { title: string; intro: string; formula: string; paragraphs: string[] }
export interface StoryStep {
  id: string;
  action: string;
  title: string;
  text?: string;
  button?: string;
  packet?: string;
  protection?: Protection;
}
export interface Chapter {
  location: string;
  scenes: { speaker: string; role: string; title: string; text: string; button: string }[];
  steps: StoryStep[];
  reply: string;
  learning: string;
}
