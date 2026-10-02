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
    feedback: "合并只是给两项加一个共同的分组，指令仍各自保留。用 0、1 分清组里的两边。",
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
  state.feedback = `“${nodeSymbols(left)}”和“${nodeSymbols(right)}”组成 ${left.weight + right.weight} 次的一组，组内每条指令的写法都多了一位。${optimal ? "先给少见指令增加位数，把短路线留给常见指令。" : "这次选的不是次数最少的两组，最终可能多用空间。可以撤销后比较。"}`;
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
  const preview = complete ? state.forest[0] : [...state.forest].filter((node) => !node.symbol).sort((a, b) => b.order - a.order)[0];
  const codes = preview ? treeToCodes(preview) : {};
  const suggestion = sorted.slice(0, 2);
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const bits = complete ? SYMBOLS.reduce((sum, { id }) => sum + counts[id] * codes[id].length, 0) : 0;
  const saved = total * 2 - bits;
  const instruction = complete ? "从最上方出发，左边读 0、右边读 1。走到一条指令就停下，沿途的数字就是它的码字。" : state.selected.length === 2
    ? `点击“合并选中节点”，把这两项放进一组。先选的在左边记 0，后选的在右边记 1。`
    : `选次数最少的两项：“${nodeSymbols(suggestion[0])}” ${suggestion[0].weight} 次和“${nodeSymbols(suggestion[1])}” ${suggestion[1].weight} 次，再合并。`;
  return `
    ${learning && !state.undo.length ? '<p class="modal-intro">卡片上的数字是指令出现的次数，也叫“权重”。每多包进一层分组，就多写一位。少见指令先分组，常见指令就能留下短路线。</p>' : ""}
    ${preview && !complete ? `<div class="tree-feedback" role="status">${icon("info")}<span>${state.feedback}</span></div><div class="tree-preview"><strong>刚分好的一组 · 看到 0、1 怎样区分了吗？</strong>${treeSvg(preview)}<p>${SYMBOLS.filter(({ id }) => codes[id]).map(({ id, label }) => `${label}：…${codes[id]}`).join(" · ")}</p><small>这里只展示组内路线；… 表示前面还没确定的部分，整棵树搭好后才能得到完整码字。</small></div>` : ""}
    <div class="tree-mentor-note"><span class="mentor-mini">岚</span><p><strong>林岚 · ${complete ? "读出新写法" : `分组 ${state.undo.length + 1} / ${SYMBOLS.length - 1}`}</strong>${instruction}</p></div>
    <div class="tree-workspace">${complete ? treeSvg(state.forest[0]) : `<div class="forest">${sorted.map((node) => `<button class="forest-node ${state.selected.includes(node.id) ? "selected" : ""} ${learning && suggestion.includes(node) ? "suggested" : ""}" data-action="tree-select" data-id="${node.id}" aria-pressed="${state.selected.includes(node.id)}"><span class="node-weight mono">${node.weight}<small>次</small></span><strong>${node.symbol ? nodeSymbols(node) : "指令组"}</strong><small>${node.symbol ? "一条独立指令" : nodeSymbols(node)}</small>${state.selected.includes(node.id) ? `<span class="node-order">${state.selected.indexOf(node.id) === 0 ? "左 · 0" : "右 · 1"}</span>` : ""}</button>`).join("")}</div>`}</div>
    ${complete || !preview ? `<div class="tree-feedback" role="status">${icon(complete ? "check" : "info")}<span>${complete ? "每条指令仍然独立，只换了写法。下面就是双方要共用的新对照表（码本）。" : state.feedback}</span></div>` : ""}
    ${complete ? `<div class="generated-codes">${SYMBOLS.map(({ id, label }) => `<div><span>${label}</span><strong class="mono">${codes[id]}</strong><small>${counts[id]} 次 × ${codes[id].length} 位</small></div>`).join("")}</div><div class="formula small-formula">${SYMBOLS.map(({ id }) => `${counts[id]}×${codes[id].length}`).join(" + ")} = ${bits} bit<br>原来每条 2 位：${total * 2} bit → 现在 ${bits} bit · ${saved > 0 ? `省下 ${saved} 位` : saved < 0 ? `多用 ${-saved} 位，可以撤销再试` : "长度相同"}</div><details class="tree-metrics"><summary>想比较平均每条占几位？</summary><div class="formula small-formula">平均码长 ${averageLength(counts, codes).toFixed(3)} bit / 指令 · 最优 ${averageLength(counts, makeHuffman(counts).codes).toFixed(3)}</div></details>` : ""}
    <div class="modal-actions tree-actions"><div><button class="secondary-button" data-action="tree-undo" ${state.undo.length ? "" : "disabled"}>${icon("reset")}撤销合并</button><button class="text-button" data-action="tree-reset">重置</button></div>${complete ? `<button class="primary-button" data-action="tree-apply">使用这套码本 ${icon("arrow")}</button>` : `<button class="primary-button" data-action="tree-merge" ${state.selected.length === 2 ? "" : "disabled"}>合并选中节点 ${icon("tree")}</button>`}</div>`;
}
