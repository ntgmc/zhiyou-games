import type { Codebook, Counts, HuffmanNode, Mission, Noise, Packet, Protection, RoundResult, Session } from "./types.js";

export const SYMBOLS = [
  { id: "A", label: "前进", color: "mint", glyph: "↑" },
  { id: "B", label: "左转", color: "blue", glyph: "←" },
  { id: "C", label: "右转", color: "gold", glyph: "→" },
  { id: "D", label: "停止", color: "pink", glyph: "■" },
] as const;

export const FIXED_CODES = Object.freeze({ A: "00", B: "01", C: "10", D: "11" });
export const STANDARD_CODES = Object.freeze({ A: "0", B: "10", C: "110", D: "111" });
export const PROTECTIONS = {
  none: { name: "直接发送", short: "无纠错", multiplier: 1 },
  repeat: { name: "三次重复", short: "重复码", multiplier: 3 },
  hamming: { name: "汉明 (7,4)", short: "汉明码", multiplier: 7 / 4 },
};

export function countSymbols(tokens: string[]): Counts {
  const counts: Counts = { A: 0, B: 0, C: 0, D: 0 };
  for (const token of tokens) {
    if (!(token in counts)) throw new Error(`未知指令：${token}`);
    counts[token]++;
  }
  return counts;
}

export function entropy(counts: Counts) {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  if (!total) return 0;
  return Object.values(counts).reduce((sum, n) => {
    const p = n / total;
    return n > 0 ? sum - p * Math.log2(p) : sum;
  }, 0);
}

export function averageLength(counts: Counts, codes: Codebook) {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return total ? Object.entries(counts).reduce((sum, [id, n]) => sum + n * codes[id].length, 0) / total : 0;
}

export function validateCodebook(codes: Codebook): { valid: boolean; message: string; ids: string[] } {
  for (const { id, label } of SYMBOLS) {
    if (typeof codes?.[id] !== "string" || !/^[01]{1,10}$/.test(codes[id])) {
      return { valid: false, message: `${label}的码字需要由 1～10 位 0、1 组成。`, ids: [id] };
    }
  }
  for (let i = 0; i < SYMBOLS.length; i++) {
    for (let j = i + 1; j < SYMBOLS.length; j++) {
      const a = SYMBOLS[i].id;
      const b = SYMBOLS[j].id;
      if (codes[a].startsWith(codes[b]) || codes[b].startsWith(codes[a])) {
        return {
          valid: false,
          message: `${SYMBOLS[i].label}与${SYMBOLS[j].label}的码字有前缀冲突，接收端无法即时识别边界。`,
          ids: [a, b],
        };
      }
    }
  }
  return { valid: true, message: "前缀码有效 · 可以逐个解码", ids: [] };
}

export function treeToCodes(node: HuffmanNode, prefix = "", result: Codebook = {}) {
  if (node.symbol) result[node.symbol] = prefix || "0";
  else {
    treeToCodes(node.left!, prefix + "0", result);
    treeToCodes(node.right!, prefix + "1", result);
  }
  return result;
}

export function makeHuffman(counts: Counts) {
  let order = 0;
  const forest: HuffmanNode[] = SYMBOLS.map(({ id }) => ({
    id: id,
    symbol: id,
    weight: counts[id] || 0,
    order: order++,
  }));
  const merges: { left: HuffmanNode; right: HuffmanNode; node: HuffmanNode }[] = [];
  while (forest.length > 1) {
    forest.sort((a, b) => a.weight - b.weight || a.order - b.order);
    const left = forest.shift()!;
    const right = forest.shift()!;
    const node = { id: `n${order}`, weight: left.weight + right.weight, order: order++, left, right };
    merges.push({ left, right, node });
    forest.push(node);
  }
  return { codes: treeToCodes(forest[0]), tree: forest[0], merges };
}

export function encodeSource(tokens: string[], codes: Codebook) {
  const validation = validateCodebook(codes);
  if (!validation.valid) throw new Error(validation.message);
  return tokens.map((id) => codes[id]).join("");
}

export function decodeSource(bits: string, codes: Codebook) {
  const reverse = new Map(Object.entries(codes).map(([id, code]) => [code, id]));
  const prefixes = new Set(Object.values(codes).flatMap((code) => Array.from({ length: code.length }, (_, i) => code.slice(0, i + 1))));
  const tokens: string[] = [];
  let buffer = "";
  for (const bit of bits) {
    buffer += bit;
    if (reverse.has(buffer)) {
      tokens.push(reverse.get(buffer)!);
      buffer = "";
    } else if (!prefixes.has(buffer)) {
      return { tokens, valid: false, remainder: buffer };
    }
  }
  return { tokens, valid: !buffer, remainder: buffer };
}

export function hammingEncode(data: string) {
  if (!/^[01]{4}$/.test(data)) throw new Error("汉明编码需要 4 位数据。");
  const [a, b, c, d] = [...data].map(Number);
  return [a ^ b ^ d, a ^ c ^ d, a, b ^ c ^ d, b, c, d].join("");
}

export function hammingDecode(word: string) {
  if (!/^[01]{7}$/.test(word)) throw new Error("汉明解码需要 7 位码字。");
  const bits = [...word].map(Number);
  const s1 = bits[0] ^ bits[2] ^ bits[4] ^ bits[6];
  const s2 = bits[1] ^ bits[2] ^ bits[5] ^ bits[6];
  const s4 = bits[3] ^ bits[4] ^ bits[5] ^ bits[6];
  const syndrome = s1 + 2 * s2 + 4 * s4;
  if (syndrome) bits[syndrome - 1] ^= 1;
  return {
    data: [bits[2], bits[4], bits[5], bits[6]].join(""),
    corrected: bits.join(""),
    syndrome,
    checks: [s1, s2, s4],
  };
}

export function protectBits(bits: string, protection: Protection) {
  if (protection === "none") return { bits, padding: 0 };
  if (protection === "repeat") return { bits: [...bits].map((bit) => bit.repeat(3)).join(""), padding: 0 };
  if (protection !== "hamming") throw new Error("未知的纠错方案。");
  const padding = (4 - bits.length % 4) % 4;
  const padded = bits + "0".repeat(padding);
  let encoded = "";
  for (let i = 0; i < padded.length; i += 4) encoded += hammingEncode(padded.slice(i, i + 4));
  return { bits: encoded, padding };
}

export function unprotectBits(bits: string, protection: Protection, sourceLength: number) {
  let data = "";
  const blocks: { received: string; data: string; corrected: string; syndrome: number; checks?: number[] }[] = [];
  if (protection === "none") return { bits: bits.slice(0, sourceLength), blocks, correctedBlocks: 0 };
  const size = protection === "repeat" ? 3 : 7;
  if (bits.length % size) throw new Error("码块长度不完整。");
  for (let i = 0; i < bits.length; i += size) {
    const word = bits.slice(i, i + size);
    if (protection === "repeat") {
      const ones = [...word].filter((bit) => bit === "1").length;
      const value = ones >= 2 ? "1" : "0";
      data += value;
      blocks.push({ received: word, data: value, corrected: value.repeat(3), syndrome: word === value.repeat(3) ? 0 : 1 });
    } else {
      const decoded = hammingDecode(word);
      data += decoded.data;
      blocks.push({ received: word, ...decoded });
    }
  }
  return {
    bits: data.slice(0, sourceLength),
    blocks,
    correctedBlocks: blocks.filter((block) => block.syndrome !== 0).length,
  };
}

export function seededRandom(seed: string | number) {
  let value = 2166136261;
  for (const character of String(seed)) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return () => {
    value += 0x6d2b79f5;
    let n = value;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

export function applyNoise(bits: string, noise: Noise, seed: string | number) {
  const random = seededRandom(seed);
  const positions: number[] = [];
  const received = [...bits];
  if (bits.length && noise.type === "single") positions.push(Math.floor(random() * bits.length));
  if (noise.type === "blocks") {
    for (let offset = 0; offset < bits.length; offset += noise.blockSize) {
      const size = Math.min(noise.blockSize, bits.length - offset);
      positions.push(offset + Math.floor(random() * size));
    }
  }
  for (const position of positions) received[position] = received[position] === "0" ? "1" : "0";
  return { bits: received.join(""), positions };
}

export function simulatePacket(packet: Packet, codes: Codebook, protection: Protection, noise: Noise, seed: string | number) {
  const sourceBits = encodeSource(packet.tokens, codes);
  const encoded = protectBits(sourceBits, protection);
  const channel = applyNoise(encoded.bits, noise, seed);
  const decoded = unprotectBits(channel.bits, protection, sourceBits.length);
  const message = decodeSource(decoded.bits, codes);
  const tokenErrors = Math.max(packet.tokens.length, message.tokens.length) -
    packet.tokens.filter((token, i) => token === message.tokens[i]).length;
  return {
    id: packet.id,
    name: packet.name,
    tokens: packet.tokens,
    sourceBits,
    transmittedBits: encoded.bits,
    receivedBits: channel.bits,
    flipPositions: channel.positions,
    decodedBits: decoded.bits,
    receivedTokens: message.tokens,
    blocks: decoded.blocks,
    correctedBlocks: decoded.correctedBlocks,
    tokenErrors,
    padding: encoded.padding,
    delivered: message.valid && tokenErrors === 0,
    cost: encoded.bits.length,
  };
}

export function createSession(mission: Mission): Session {
  return {
    missionId: mission.id,
    round: 1,
    coding: mission.initialCoding || "fixed",
    customCodes: { ...(mission.initialCodes || FIXED_CODES) },
    receiverCodes: { ...(mission.receiverCodes || FIXED_CODES) },
    protection: mission.initialProtection || "none",
    selectedIds: [...(mission.initialSelected || [mission.packets[0].id])],
    taskStates: Object.fromEntries(mission.packets.map((packet) => [packet.id, "pending"])),
    history: [],
    totalBits: 0,
    status: "playing",
    stars: 0,
  };
}

export function sessionCodes(session: Session) {
  return session.coding === "fixed" ? FIXED_CODES : session.customCodes;
}

export function sameCodes(a: Codebook, b: Codebook) {
  return SYMBOLS.every(({ id }) => a[id] === b[id]);
}

export function roundConditions(mission: Mission, round = 1) {
  const window = mission.windows?.[round - 1];
  return { budget: window?.budget ?? mission.budget, noise: window?.noise ?? mission.noise, label: window?.label || `第 ${round} 轮` };
}

export function packetAvailable(packet: Packet, round: number) {
  return (packet.releaseRound || 1) <= round;
}

export function selectedCounts(session: Session, mission: Mission) {
  let packets = mission.packets.filter((packet) => session.selectedIds.includes(packet.id) && session.taskStates[packet.id] === "pending" && packetAvailable(packet, session.round));
  if (!packets.length) packets = mission.packets.filter((packet) => session.taskStates[packet.id] === "pending" && packetAvailable(packet, session.round));
  if (!packets.length) packets = mission.packets;
  return countSymbols(packets.flatMap((packet) => packet.tokens));
}

export function planRound(session: Session, mission: Mission) {
  const conditions = roundConditions(mission, session.round);
  const codes = sessionCodes(session);
  const validation = validateCodebook(codes);
  const selected = mission.packets.filter((packet) => session.selectedIds.includes(packet.id) && session.taskStates[packet.id] === "pending");
  const costs = validation.valid ? selected.map((packet) => {
    const bits = encodeSource(packet.tokens, codes);
    const protectedData = protectBits(bits, session.protection);
    return { id: packet.id, sourceBits: bits.length, cost: protectedData.bits.length, padding: protectedData.padding };
  }) : [];
  const payloadBits = costs.reduce((sum, packet) => sum + packet.cost, 0);
  const syncBits = validation.valid && mission.syncCost && !sameCodes(codes, session.receiverCodes) ? mission.syncCost : 0;
  const totalBits = payloadBits + syncBits;
  let reason = "";
  if (session.status !== "playing") reason = "本次任务已结束。";
  else if (!validation.valid) reason = validation.message;
  else if (!mission.protections.includes(session.protection)) reason = "本关尚未开放这个纠错方案。";
  else if (!selected.length) reason = "请至少选择一条待发送的消息。";
  else if (selected.some((packet) => !packetAvailable(packet, session.round))) reason = "部分消息尚未抵达，不能提前发送。";
  else if (totalBits > conditions.budget) reason = `超出本轮预算 ${totalBits - conditions.budget} bit。请压缩消息或调整发送队列。`;
  else if (mission.totalBudget != null && session.totalBits + totalBits > mission.totalBudget) reason = `超出整次值班总预算 ${session.totalBits + totalBits - mission.totalBudget} bit。需要重新规划。`;
  return {
    valid: !reason,
    reason,
    validation,
    codes,
    selected,
    costs,
    payloadBits,
    syncBits,
    totalBits,
    budget: conditions.budget,
    noise: conditions.noise,
    remainingBits: conditions.budget - totalBits,
    totalRemaining: mission.totalBudget == null ? null : mission.totalBudget - session.totalBits,
  };
}

function finishRound<T extends Session>(session: T, mission: Mission, result: RoundResult) {
  const next = structuredClone(session);
  for (const packet of result.packets) next.taskStates[packet.id] = packet.delivered ? "delivered" : "failed";
  for (const packet of mission.packets) {
    if (next.taskStates[packet.id] === "pending" && packet.deadline <= session.round) next.taskStates[packet.id] = "expired";
  }
  result.expired = mission.packets.filter((packet) => session.taskStates[packet.id] === "pending" && next.taskStates[packet.id] === "expired").map((packet) => packet.id);
  result.taskStates = { ...next.taskStates };
  next.totalBits += result.totalBits;
  next.receiverCodes = { ...result.codes };
  next.history.push(result);
  const criticalFailure = mission.packets.some((packet) => packet.required !== false && ["failed", "expired"].includes(next.taskStates[packet.id]));
  const allResolved = mission.packets.every((packet) => next.taskStates[packet.id] !== "pending");
  if (criticalFailure) next.status = "lost";
  else if (allResolved || session.round >= mission.rounds) {
    next.status = mission.packets.every((packet) => packet.required === false || next.taskStates[packet.id] === "delivered") ? "won" : "lost";
  } else {
    next.round++;
  }
  if (next.status === "won") {
    const allDelivered = mission.packets.every((packet) => next.taskStates[packet.id] === "delivered");
    next.stars = 1 + Number(allDelivered) + Number(allDelivered && next.totalBits <= mission.parBits);
  }
  next.selectedIds = [];
  return { next, result };
}

export function transmitRound<T extends Session>(session: T, mission: Mission) {
  const plan = planRound(session, mission);
  if (!plan.valid) throw new Error(plan.reason);
  const result: RoundResult = {
    round: session.round,
    codes: { ...plan.codes },
    coding: session.coding,
    protection: session.protection,
    syncBits: plan.syncBits,
    totalBits: plan.totalBits,
    budget: plan.budget,
    noise: structuredClone(plan.noise),
    skipped: false,
    expired: [],
    packets: plan.selected.map((packet) =>
      simulatePacket(packet, plan.codes, session.protection, plan.noise, `${mission.id}:${session.round}:${packet.id}`)),
  };
  return finishRound(session, mission, result);
}

export function waitRound<T extends Session>(session: T, mission: Mission) {
  if (session.status !== "playing") throw new Error("本次任务已结束。");
  return finishRound(session, mission, {
    round: session.round,
    codes: { ...session.receiverCodes },
    protection: session.protection,
    totalBits: 0,
    syncBits: 0,
    budget: roundConditions(mission, session.round).budget,
    noise: structuredClone(roundConditions(mission, session.round).noise),
    skipped: true,
    expired: [],
    packets: [],
  });
}
