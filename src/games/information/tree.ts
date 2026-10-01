import { SYMBOLS, averageLength, makeHuffman, treeToCodes } from "./engine.js";
import { icon } from "./ui.js";
import type { Counts, HuffmanNode } from "./types.js";

export interface TreeState {
  forest: HuffmanNode[];
  selected: string[];
  undo: { forest: HuffmanNode[]; next: number }[];
  next: number;
  feedback: string;
}

export function createTree(counts: Counts): TreeState {
  return {
    forest: SYMBOLS.map(({ id }, order) => ({ id, symbol: id, weight: counts[id], order })),
    selected: [], undo: [], next: 4,
    feedback: "选择两个节点后点击合并。按哈夫曼规则，应选择当前权重最小的两个。",
  };
}

export function mergeTree(state: TreeState): void {
  if (state.selected.length !== 2) return;
  const sorted = [...state.forest].sort((a, b) => a.weight - b.weight || a.order - b.order);
  const [left, right] = state.selected.map((id) => state.forest.find((node) => node.id === id));
  if (!left || !right || left === right) return;
  const optimal = left.weight + right.weight === sorted[0].weight + sorted[1].weight;
  state.undo.push(structuredClone({ forest: state.forest, next: state.next }));
  state.forest = state.forest.filter((node) => !state.selected.includes(node.id));
  state.forest.push({ id: `n${state.next}`, weight: left.weight + right.weight, order: state.next++, left, right });
  state.selected = [];
  state.feedback = optimal ? "这次合并符合哈夫曼规则。继续选择最低的两个权重。" : "这次没有合并最低的两个权重，码树仍可用，但平均长度可能更长。可以撤销后比较。";
}

function treeSvg(root: HuffmanNode): string {
  const nodes = new Map<HuffmanNode, { x: number; y: number }>();
  const edges: [HuffmanNode, HuffmanNode, string][] = [];
  let leaves = 0;
  let maxDepth = 0;
  function layout(node: HuffmanNode, depth: number): number {
    maxDepth = Math.max(depth, maxDepth);
    let x: number;
    if (node.symbol) x = 60 + leaves++ * 112;
    else {
      x = (layout(node.left!, depth + 1) + layout(node.right!, depth + 1)) / 2;
      edges.push([node, node.left!, "0"], [node, node.right!, "1"]);
    }
    nodes.set(node, { x, y: 32 + depth * 76 });
    return x;
  }
  layout(root, 0);
  return `<svg class="code-tree-svg" viewBox="0 0 ${Math.max(180, leaves * 112 + 8)} ${maxDepth * 76 + 78}" role="img" aria-label="二叉编码树，左分支为0，右分支为1">
    ${edges.map(([parent, child, label]) => {
      const a = nodes.get(parent)!;
      const b = nodes.get(child)!;
      return `<path d="M${a.x} ${a.y + 12}L${b.x} ${b.y - 15}" fill="none" stroke="#345962" stroke-width="1.5"/><text x="${(a.x + b.x) / 2 + (label === "0" ? -8 : 8)}" y="${(a.y + b.y) / 2}" fill="#9abbbf" text-anchor="middle" font-size="12">${label}</text>`;
    }).join("")}
    ${[...nodes].map(([node, { x, y }]) => `<circle cx="${x}" cy="${y}" r="${node.symbol ? 20 : 16}" fill="${node.symbol ? "#153d35" : "#172b34"}" stroke="${node.symbol ? "#76e6c1" : "#456774"}"/><text x="${x}" y="${y + 4}" fill="${node.symbol ? "#a5f0d9" : "#b7cdd1"}" text-anchor="middle" font-size="12">${node.symbol || node.weight}</text>${node.symbol ? `<text x="${x}" y="${y + 40}" fill="#94acb4" text-anchor="middle" font-size="10">${SYMBOLS.find((symbol) => symbol.id === node.symbol)!.label} · ${node.weight}</text>` : ""}`).join("")}
  </svg>`;
}

function nodeSymbols(node: HuffmanNode): string {
  return node.symbol ? SYMBOLS.find((item) => item.id === node.symbol)!.label : `${nodeSymbols(node.left!)} + ${nodeSymbols(node.right!)}`;
}

export function renderTree(state: TreeState, counts: Counts, learning: boolean): string {
  const complete = state.forest.length === 1;
  const sorted = [...state.forest].sort((a, b) => a.weight - b.weight || a.order - b.order);
  const codes = complete ? treeToCodes(state.forest[0]) : {};
  const suggestion = sorted.slice(0, 2);
  const instruction = complete ? "树搭好了。点击“使用这套码本”，回去检查发送长度。" : state.selected.length === 2
    ? `已选中 ${state.selected.map((id) => state.forest.find((node) => node.id === id)!.weight).join(" 和 ")}。点击下方的“合并选中节点”。`
    : `现在最小的两个权重是 ${suggestion[0].weight} 和 ${suggestion[1].weight}。选中它们，再合并。`;
  return `
    ${learning ? `<div class="tree-mentor-note"><span class="mentor-mini">岚</span><p><strong>林岚</strong>${instruction}</p></div>` : '<p class="modal-intro">每次合并两个节点，新节点的权重是两者之和。最后从根出发，沿左边记 0、沿右边记 1，走到指令叶子。</p>'}
    <div class="tree-workspace">${complete ? treeSvg(state.forest[0]) : `<div class="forest">${sorted.map((node) => `<button class="forest-node ${state.selected.includes(node.id) ? "selected" : ""} ${learning && suggestion.includes(node) ? "suggested" : ""}" data-action="tree-select" data-id="${node.id}"><span class="node-weight mono">${node.weight}</span><strong>${node.symbol || "合并节点"}</strong><small>${nodeSymbols(node)}</small>${state.selected.includes(node.id) ? `<span class="node-order">${state.selected.indexOf(node.id) === 0 ? "左 · 0" : "右 · 1"}</span>` : ""}</button>`).join("")}</div>`}</div>
    <div class="tree-feedback">${icon(complete ? "check" : "info")}<span>${complete ? "码树已完成。检查平均码长后，可以将这套码本应用到工作台。" : state.feedback}</span></div>
    ${complete ? `<div class="generated-codes">${SYMBOLS.map(({ id, label }) => `<div><span>${label}</span><strong class="mono">${codes[id]}</strong></div>`).join("")}</div><div class="formula small-formula">平均码长 ${averageLength(counts, codes).toFixed(3)} bit / 指令 · 最优 ${averageLength(counts, makeHuffman(counts).codes).toFixed(3)}</div>` : ""}
    <div class="modal-actions tree-actions"><div><button class="secondary-button" data-action="tree-undo" ${state.undo.length ? "" : "disabled"}>${icon("reset")}撤销合并</button><button class="text-button" data-action="tree-reset">重置</button></div>${complete ? `<button class="primary-button" data-action="tree-apply">使用这套码本 ${icon("arrow")}</button>` : `<button class="primary-button" data-action="tree-merge" ${state.selected.length === 2 ? "" : "disabled"}>合并选中节点 ${icon("tree")}</button>`}</div>`;
}
