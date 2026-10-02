import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GAMES } from "../.build/src/site/catalog.js";
import { readSave, writeSave } from "../.build/src/games/information/storage.js";
import { createSession, transmitRound, treeToCodes, validateCodebook, averageLength, makeHuffman } from "../.build/src/games/information/engine.js";
import { MISSIONS } from "../.build/src/games/information/missions.js";
import { createTree, mergeTree, renderTree } from "../.build/src/games/information/tree.js";
import { renderLab } from "../.build/src/games/information/lab.js";
import { storyResult, detailedResult } from "../.build/src/games/information/results.js";
import { MISSIONS as HARBOR_MISSIONS } from "../.build/src/games/game-theory/missions.js";
import { MISSIONS as REPAIR_MISSIONS } from "../.build/src/games/probability/missions.js";

test("each catalog entry has an independent static page and game code stays outside the home entry", async () => {
  assert.ok(GAMES.length);
  assert.equal(new Set(GAMES.map(({ id }) => id)).size, GAMES.length);
  assert.equal(GAMES.find(({ id }) => id === "information").chapters, MISSIONS.length);
  assert.equal(GAMES.find(({ id }) => id === "game-theory").chapters, HARBOR_MISSIONS.length);
  assert.equal(GAMES.find(({ id }) => id === "probability").chapters, REPAIR_MISSIONS.length);
  for (const game of GAMES) {
    assert.match(game.href, /^\.\/games\/[a-z][a-z0-9-]*\/$/);
    const html = await readFile(new URL(`../${game.href}index.html`, import.meta.url), "utf8");
    assert.ok(html.includes(game.title));
    assert.match(html, /type="module"/);
  }
  const home = await readFile(new URL("../.build/src/site/home.js", import.meta.url), "utf8");
  assert.doesNotMatch(home, /from ["'].*games\//);
});

test("the relocated game restores version-one progress and current sessions", () => {
  const session = createSession(MISSIONS[7]);
  const legacy = { version: 1, activeId: 8, progress: { unlocked: 8, best: { 8: 3, 12: 2 }, lessons: ["entropy"] }, session };
  const values = new Map([["deep-space-comms-save-v1", JSON.stringify(legacy)]]);
  const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const loaded = readSave("deep-space-comms-save-v1", storage);
  assert.deepEqual(loaded.session, session);
  assert.equal(loaded.progress.unlocked, 13);
  assert.deepEqual(loaded.progress.soloBest, {});
  writeSave("deep-space-comms-test-v1", { ...loaded, activeId: 1 }, storage);
  assert.equal(readSave("deep-space-comms-save-v1", storage).activeId, 8);
  assert.equal(readSave("deep-space-comms-test-v1", storage).activeId, 1);
  const unavailable = { getItem() { throw new Error("Storage unavailable"); }, setItem() { throw new Error("Storage unavailable"); } };
  assert.equal(readSave("save", unavailable).activeId, 1);
  assert.doesNotThrow(() => writeSave("save", loaded, unavailable));
  values.set("broken", JSON.stringify({ ...legacy, session: { ...session, protection: "unknown" } }));
  assert.equal(readSave("broken", storage).session, null);
});

test("extracted tree and correction workshops keep their teaching behavior", () => {
  const counts = { A: 8, B: 4, C: 2, D: 2 };
  const tree = createTree(counts);
  assert.match(renderTree(tree, counts, true), /右转” 2 次和“停止” 2 次/);
  mergeTree(tree);
  assert.equal(tree.forest.length, 4, "an incomplete selection does not merge");
  while (tree.forest.length > 1) {
    tree.selected = [...tree.forest].sort((a, b) => a.weight - b.weight || a.order - b.order).slice(0, 2).map(({ id }) => id);
    mergeTree(tree);
  }
  const codes = treeToCodes(tree.forest[0]);
  assert.equal(validateCodebook(codes).valid, true);
  assert.equal(averageLength(counts, codes), averageLength(counts, makeHuffman(counts).codes));
  assert.equal(tree.undo.length, 3);
  assert.match(renderTree(tree, counts, true), /使用这套码本/);
  assert.match(renderLab({ data: "1011", flipped: [3], corrected: true }, true), /恢复数据：.*1011.*与原始数据一致/);
  assert.match(renderLab({ data: "x", flipped: [], corrected: false }, false), /请输入恰好 4 位/);
  const mission = MISSIONS[0];
  const { next, result } = transmitRound(createSession(mission), mission);
  assert.match(storyResult(next, mission, result), /任务完成，收到回信。/);
  assert.match(detailedResult(next, mission, result), /信道接收/);
  assert.match(detailedResult(next, mission, result, true), /第 1 轮通信记录/);
});
