import test from "node:test";
import assert from "node:assert/strict";
import { analyze, cloneRoutes, cutFor, execute, replaceRoute, targets } from "../.build/src/games/network/engine.js";
import { MISSIONS } from "../.build/src/games/network/missions.js";
import { advanceGuide, guideLength, guideStep } from "../.build/src/games/network/story.js";
import { freshSave, readSave, recordScore, startChapter } from "../.build/src/games/network/storage.js";
import { archiveChapter, resumeChapter } from "../.build/src/shared/chapter-drafts.js";
import { exportBackup, importBackup } from "../.build/src/shared/save-backup.js";

// Independent edge-flow optimization, with each receiver's demand as its sink capacity.
function minimumCost(mission) {
  const nodes = [...mission.places.map(p => p.id), "sink"];
  const graph = Object.fromEntries(nodes.map(id => [id, []]));
  function add(from, to, capacity, cost) {
    const forward = { to, capacity, cost }, reverse = { to: from, capacity: 0, cost: -cost };
    forward.reverse = reverse;
    reverse.reverse = forward;
    graph[from].push(forward);
    graph[to].push(reverse);
  }
  mission.edges.forEach(e => add(e.from, e.to, e.capacity, e.cost));
  targets(mission).forEach(p => add(p.id, "sink", p.need, 0));
  let total = 0, cost = 0;
  while (true) {
    const distance = Object.fromEntries(nodes.map(id => [id, Infinity])), previous = {};
    distance[mission.source] = 0;
    for (let pass = 1; pass < nodes.length; pass++) {
      let changed = false;
      for (const from of nodes) for (const edge of graph[from]) {
        if (edge.capacity > 0 && distance[from] + edge.cost < distance[edge.to]) {
          distance[edge.to] = distance[from] + edge.cost;
          previous[edge.to] = { from, edge };
          changed = true;
        }
      }
      if (!changed) break;
    }
    if (!Number.isFinite(distance.sink)) break;
    let amount = Infinity;
    for (let id = "sink"; id !== mission.source; id = previous[id].from) amount = Math.min(amount, previous[id].edge.capacity);
    for (let id = "sink"; id !== mission.source; id = previous[id].from) {
      previous[id].edge.capacity -= amount;
      previous[id].edge.reverse.capacity += amount;
    }
    total += amount;
    cost += amount * distance.sink;
  }
  return { total, cost };
}

function paths(mission, from = mission.source, nodes = [from]) {
  if (targets(mission).some(p => p.id === from)) return [nodes];
  return mission.edges.filter(e => e.from === from && !nodes.includes(e.to))
    .flatMap(e => paths(mission, e.to, [...nodes, e.to]));
}
function cheapestFirst(mission, seed = []) {
  const routes = cloneRoutes(seed);
  const choices = paths(mission).map(nodes => ({ nodes, cost: nodes.slice(1).reduce((sum, to, i) =>
    sum + mission.edges.find(e => e.from === nodes[i] && e.to === to).cost, 0) })).sort((a, b) => a.cost - b.cost);
  while (true) {
    const current = analyze(mission, routes);
    let added = false;
    for (const choice of choices) {
      const receiver = targets(mission).find(p => p.id === choice.nodes.at(-1));
      const available = choice.nodes.slice(1).map((to, i) => {
        const edge = mission.edges.find(e => e.from === choice.nodes[i] && e.to === to);
        return edge.capacity - current.flow[edge.id];
      });
      const amount = Math.min(receiver.need - current.delivered[receiver.id], mission.supply - current.total,
        choice.cost ? Math.floor((mission.budget - current.cost) / choice.cost) : Infinity, ...available);
      if (amount > 0) { routes.push({ nodes: choice.nodes, amount }); added = true; break; }
    }
    if (!added) return routes;
  }
}

test("all sixteen new duties have executable independent references and independently verified minimum costs", () => {
  assert.deepEqual(MISSIONS.map(m => m.id), Array.from({ length: 24 }, (_, i) => i + 1));
  const costs = [12, 24, 27, 18, 24, 36, 36, 26, 45, 44, 41, 47, 45, 49, 56, 66];
  for (const mission of MISSIONS) {
    assert.deepEqual(minimumCost(mission), { total: targets(mission).reduce((sum, p) => sum + p.need, 0), cost: mission.efficient });
    if (mission.id <= 8) continue;
    assert.equal(new Set(mission.places.map(p => p.id)).size, mission.places.length);
    assert.equal(new Set(mission.edges.map(e => e.id)).size, mission.edges.length);
    for (const e of mission.edges) {
      assert.ok(mission.places.some(p => p.id === e.from) && mission.places.some(p => p.id === e.to));
      assert.ok(Number.isInteger(e.capacity) && e.capacity > 0 && Number.isInteger(e.cost) && e.cost >= 0);
    }
    const save = freshSave();
    startChapter(save, mission.id);
    assert.equal(guideStep(save.guide, mission.id), "arrival");
    assert.equal(guideLength(mission.id), 1);
    assert.equal(advanceGuide(save.guide, mission, save.routes, save.side), true);
    assert.equal(guideStep(save.guide, mission.id), "dispatch");
    const result = execute(mission, mission.reference, mission.referenceCut ?? [mission.source]);
    assert.equal(result.stars, 3, `chapter ${mission.id}`);
    assert.equal(result.analysis.cost, costs[mission.id - 9]);
    assert.deepEqual(result.analysis.delivered, Object.fromEntries(targets(mission).map(p => [p.id, p.need])));
    assert.equal(mission.hints.length, 3);
    assert.ok(mission.opening && mission.recap && targets(mission).every(p => p.reply));
    if (mission.seed) assert.equal(analyze(mission, mission.seed).errors.length, 0);
  }
});

test("internal cuts prove current capacity and exclude inbound arrows from the bound", () => {
  for (const mission of MISSIONS.slice(8).filter(m => m.certificate)) {
    const variable = mission.places.filter(p => p.id !== mission.source && !p.need);
    let minimum = Infinity;
    for (let mask = 0; mask < 2 ** variable.length; mask++) {
      const side = [mission.source, ...variable.filter((_, i) => mask & 2 ** i).map(p => p.id)];
      const capacity = mission.edges.filter(e => side.includes(e.from) && !side.includes(e.to)).reduce((sum, e) => sum + e.capacity, 0);
      assert.equal(cutFor(mission, side).capacity, capacity);
      minimum = Math.min(minimum, capacity);
    }
    const delivered = analyze(mission, mission.reference).total;
    assert.equal(minimum, delivered);
    assert.equal(cutFor(mission, mission.referenceCut).capacity, minimum);
    assert.equal(execute(mission, mission.reference, [mission.source]).passed, false);
  }
  const inbound = MISSIONS[11];
  assert.deepEqual(cutFor(inbound, ["S", "A", "B"]), { capacity: 5, edges: ["AC", "BC"] });
  const expanded = MISSIONS[17];
  assert.equal(cutFor(expanded, expanded.places.filter(p => !p.need).map(p => p.id)).capacity, 19);
  assert.equal(execute(expanded, expanded.reference, expanded.places.filter(p => !p.need).map(p => p.id)).passed, false);
});

test("direct route edits free shared capacity in both rerouting duties and accept alternate plans", () => {
  for (const mission of [MISSIONS[12], MISSIONS[13]]) {
    assert.equal(analyze(mission, cheapestFirst(mission, mission.seed)).total, 4);
    const rerouted = replaceRoute(mission, mission.seed, 0, mission.reference[0]);
    assert.equal(rerouted.length, 1);
    const completed = cheapestFirst(mission, rerouted);
    assert.deepEqual(analyze(mission, completed), analyze(mission, mission.reference));
    assert.equal(execute(mission, completed, ["S"]).stars, 3);
    const alternate = replaceRoute(mission, mission.seed, 0, mission.reference[1]);
    alternate.push(...cloneRoutes(mission.reference.slice(0, 1)));
    assert.equal(execute(mission, alternate, ["S"]).stars, 3);
    assert.equal(analyze(mission, mission.seed).total, 4, "the original draft was not mutated");
  }
});

test("cheap-first choices strand a receiver or exceed the final fee target even after all boxes arrive", () => {
  const first = MISSIONS[8];
  const trapped = cheapestFirst(first);
  assert.equal(analyze(first, trapped).errors.length, 0);
  assert.equal(execute(first, trapped, ["S"]).passed, false);
  assert.deepEqual(analyze(first, trapped).delivered, { T: 2, U: 3 });
  const final = MISSIONS[23];
  for (const seed of [[], final.seed]) {
    const routes = cheapestFirst(final, seed);
    const result = execute(final, routes, ["S"]);
    assert.equal(result.analysis.total, 32);
    assert.equal(result.passed, false);
    assert.match(result.failures.join(" "), /费用/);
    assert.ok(result.analysis.cost > final.costGoal && result.analysis.cost <= final.budget);
  }
  const unbalanced = cloneRoutes(final.reference);
  unbalanced[4].amount--;
  unbalanced.push({ nodes: ["S", "B", "D", "T"], amount: 1 });
  const result = execute(final, unbalanced, ["S"]);
  assert.equal(result.analysis.total, 32);
  assert.equal(result.analysis.cost, 66);
  assert.equal(result.passed, false);
  assert.match(result.failures.join(" "), /山脚站.*还缺 1/);
});

test("the final duty accepts alternative three-star route allocations and an independent two-star plan", () => {
  const final = MISSIONS[23];
  assert.equal(final.places.length, 12);
  assert.equal(final.edges.length, 23);
  const alternate = cloneRoutes(final.reference);
  alternate[0].amount--;
  alternate[1].amount++;
  alternate[4].amount--;
  alternate.push({ nodes: ["S", "B", "D", "T"], amount: 1 });
  assert.equal(execute(final, alternate, ["S"]).stars, 3);
  assert.deepEqual(analyze(final, alternate), analyze(final, final.reference));
  const two = cloneRoutes(final.reference);
  two[3].amount--;
  two.push({ nodes: ["S", "C", "E", "U"], amount: 1 });
  const result = execute(final, two, ["S"]);
  assert.equal(result.stars, 2);
  assert.equal(result.analysis.cost, 68);
  const overloaded = cloneRoutes(final.reference);
  overloaded[6].amount++;
  assert.match(analyze(final, overloaded).errors.join(" "), /容量/);
  assert.throws(() => execute(final, overloaded, ["S"]), /容量/);
});

test("old chapter eight continues to nine; long drafts, route edits, cuts, scores and backups restore", () => {
  let save = freshSave();
  startChapter(save, 8);
  save.routes = cloneRoutes(MISSIONS[7].reference);
  save.guide.step = guideLength(8);
  save.result = execute(MISSIONS[7], save.routes, save.side);
  recordScore(save);
  assert.equal(readSave("old", { getItem: () => JSON.stringify(save) }).unlocked, 9);
  for (const mission of MISSIONS.slice(8)) {
    startChapter(save, mission.id);
    assert.deepEqual(readSave("arrival", { getItem: () => JSON.stringify(save) }), save);
    advanceGuide(save.guide, mission, save.routes, save.side);
    save.routes = [];
    for (const route of mission.reference) {
      save.routes.push(...cloneRoutes([route]));
      assert.deepEqual(readSave("draft", { getItem: () => JSON.stringify(save) }), save);
    }
    save.side = [...mission.referenceCut ?? [mission.source]];
    save.result = execute(mission, save.routes, save.side);
    recordScore(save);
    save = readSave("result", { getItem: () => JSON.stringify(save) });
    assert.equal(save.solo[mission.id], 3);
  }
  const final = structuredClone(save);
  save.chapters = archiveChapter(save);
  startChapter(save, 14);
  save.editing = 0;
  save.codes = ["SA"];
  save.amount = 2;
  assert.deepEqual(readSave("path", { getItem: () => JSON.stringify(save) }), save);
  assert.deepEqual(importBackup(exportBackup("network", save, readSave), "network", readSave), save);
  const legacy = { ...save, editing: "residual", codes: ["SB", "-CB", "-AC"] };
  assert.deepEqual(importBackup(JSON.stringify({ format: "zhiyou-save", version: 1, game: "network", save: legacy }), "network", readSave), legacy);
  save.chapters = archiveChapter(legacy);
  const restored = resumeChapter(save, 24, readSave, { best: save.best, solo: save.solo, unlocked: save.unlocked, mode: save.mode });
  assert.deepEqual(restored.result, final.result);
  const backup = exportBackup("network", restored, readSave);
  assert.deepEqual(importBackup(backup, "network", readSave), restored);
  const forged = structuredClone(restored);
  forged.result.analysis.cost = 0;
  forged.result.analysis.delivered.W = 99;
  assert.deepEqual(readSave("forged", { getItem: () => JSON.stringify(forged) }).result, restored.result);
  startChapter(save, 24);
  assert.deepEqual(save.routes, MISSIONS[23].seed);
  assert.equal(save.solo[24], 3);
  save.hinted = true;
  save.hintLevel = 3;
  save.routes = cloneRoutes(MISSIONS[23].reference);
  save.result = execute(MISSIONS[23], save.routes, save.side);
  recordScore(save);
  assert.equal(save.solo[24], 3);
});
