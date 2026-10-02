import test from "node:test";
import assert from "node:assert/strict";
import { createTree, mergeTree, renderTree } from "../.build/src/games/information/tree.js";
import { treeToCodes, validateCodebook } from "../.build/src/games/information/engine.js";
import { renderLab } from "../.build/src/games/information/lab.js";

test("each merge shows the grouping, local routes and final savings without removing commands", () => {
  const counts = { A: 8, B: 4, C: 2, D: 2 };
  const state = createTree(counts);
  assert.match(renderTree(state, counts, true), /数字是指令出现的次数/);
  for (const [selected, routes] of [
    [["C", "D"], /右转：…0 · 停止：…1/],
    [["B", "n4"], /左转：…0 · 右转：…10 · 停止：…11/],
    [["A", "n5"], /32 bit → 现在 28 bit · 省下 4 位/],
  ]) {
    state.selected = selected;
    mergeTree(state);
    const html = renderTree(state, counts, true);
    assert.match(html, routes);
    if (state.forest.length > 1) {
      assert.match(html, /还没确定的部分/);
      assert.match(html, /role="status"/);
      assert.doesNotMatch(html, /data-action="tree-apply"/);
      assert.ok(html.indexOf("tree-preview") < html.indexOf("tree-mentor-note"), "show the merge's meaning before the next instruction");
    }
  }
  const codes = treeToCodes(state.forest[0]);
  assert.deepEqual(codes, { A: "0", B: "10", C: "110", D: "111" });
  assert.equal(validateCodebook(codes).valid, true);
  assert.match(renderTree(state, counts, true), /8×1 \+ 4×2 \+ 2×3 \+ 2×3 = 28 bit/);
  assert.match(renderTree(state, counts, true), /<details class="tree-metrics"><summary>.*平均每条.*平均码长 1\.750/);
  const previous = state.undo.pop();
  state.forest = previous.forest;
  state.next = previous.next;
  state.selected = [];
  assert.match(renderTree(state, counts, true), /左转：…0 · 右转：…10 · 停止：…11/);
});

test("different selection orders and less efficient trees retain accurate routes and costs", () => {
  const counts = { A: 8, B: 4, C: 2, D: 2 };
  const reversed = createTree(counts);
  reversed.selected = ["D", "C"];
  mergeTree(reversed);
  assert.match(renderTree(reversed, counts, false), /右转：…1 · 停止：…0/);

  const state = createTree(counts);
  for (const selected of [["A", "B"], ["n4", "C"], ["n5", "D"]]) {
    state.selected = selected;
    mergeTree(state);
  }
  assert.equal(validateCodebook(treeToCodes(state.forest[0])).valid, true);
  assert.match(renderTree(state, counts, false), /现在 42 bit · 多用 10 位/);
});

test("tree explanations stay accurate when some or all command counts are zero", () => {
  for (const counts of [{ A: 0, B: 0, C: 0, D: 2 }, { A: 0, B: 0, C: 0, D: 0 }]) {
    const state = createTree(counts);
    while (state.forest.length > 1) {
      state.selected = [...state.forest].sort((a, b) => a.weight - b.weight || a.order - b.order).slice(0, 2).map(({ id }) => id);
      mergeTree(state);
    }
    const html = renderTree(state, counts, true);
    assert.doesNotMatch(html, /NaN|Infinity|undefined/);
    assert.equal(validateCodebook(treeToCodes(state.forest[0])).valid, true);
    assert.match(html, counts.D ? /省下 2 位/ : /0 bit · 长度相同/);
  }
});

test("the first correction workshop shows the result and keeps calculation details optional", () => {
  const html = renderLab({ data: "1011", flipped: [5], corrected: false }, true);
  const details = html.match(/<details class="lab-check-details">([\s\S]*?)<\/details>/);
  assert.ok(details);
  assert.match(details[1], /综合值/);
  const visible = html.replace(details[0], "");
  assert.match(visible, /错误在第 5 位/);
  assert.doesNotMatch(visible, /综合值|偶校验|⊕|2×/);
  assert.match(renderLab({ data: "1011", flipped: [5], corrected: false }, false), /综合值/);
});
