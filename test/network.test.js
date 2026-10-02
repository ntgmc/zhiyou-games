import test from "node:test";
import assert from "node:assert/strict";
import { adjust, analyze, cloneRoutes, cutFor, execute, moves, routeError, targets, walk } from "../.build/src/games/network/engine.js";
import { MISSIONS } from "../.build/src/games/network/missions.js";
import { advanceGuide, freshGuide, guideLength, guideReady, guideStep, guideText } from "../.build/src/games/network/story.js";
import { freshSave, readSave, recordScore, startChapter, writeSave } from "../.build/src/games/network/storage.js";

const memory = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
function pathsFor(mission, from = mission.source, nodes = [from]) {
  if (targets(mission).some((place) => place.id === from)) return [nodes];
  return mission.edges.filter((edge) => edge.from === from && !nodes.includes(edge.to))
    .flatMap((edge) => pathsFor(mission, edge.to, [...nodes, edge.to]));
}
function feasiblePlans(mission) {
  const paths = pathsFor(mission);
  const flow = Object.fromEntries(mission.edges.map((edge) => [edge.id, 0]));
  const received = Object.fromEntries(targets(mission).map((place) => [place.id, 0]));
  let count = 0;
  let minimum = Infinity;
  const visit = (index, routes) => {
    if (index === paths.length) {
      if (!targets(mission).every((place) => received[place.id] === place.need)) return;
      const analysis = analyze(mission, routes);
      if (analysis.errors.length) return;
      count++;
      minimum = Math.min(minimum, analysis.cost);
      return;
    }
    const nodes = paths[index];
    const edges = nodes.slice(1).map((to, i) => mission.edges.find((edge) => edge.from === nodes[i] && edge.to === to));
    const target = targets(mission).find((place) => place.id === nodes.at(-1));
    const limit = Math.min(target.need - received[target.id], ...edges.map((edge) => edge.capacity - flow[edge.id]));
    for (let amount = 0; amount <= limit; amount++) {
      edges.forEach((edge) => flow[edge.id] += amount);
      received[target.id] += amount;
      visit(index + 1, amount ? [...routes, { nodes, amount }] : routes);
      received[target.id] -= amount;
      edges.forEach((edge) => flow[edge.id] -= amount);
    }
  };
  visit(0, []);
  return { count, minimum };
}

test("all eight references execute, and independently enumerated routes validate efficiency targets", () => {
  assert.equal(MISSIONS.length, 8);
  const costs = [0, 3, 8, 20, 18, 15, 26, 40];
  for (const mission of MISSIONS) {
    assert.equal(new Set(mission.edges.map((edge) => edge.id)).size, mission.edges.length);
    const result = execute(mission, mission.reference, mission.referenceCut ?? [mission.source]);
    assert.equal(result.passed, true, `chapter ${mission.id}`);
    assert.equal(result.stars, 3);
    assert.equal(result.analysis.cost, costs[mission.id - 1]);
    const enumerated = feasiblePlans(mission);
    assert.equal(enumerated.minimum, mission.efficient, `minimum cost in chapter ${mission.id}`);
    assert.ok(enumerated.count > 0);
    if (mission.id >= 7) assert.ok(enumerated.count > 1, "independent chapters accept multiple plans");
  }
});

test("shared capacity, route directions, source supply and fees are hard constraints", () => {
  const mission = MISSIONS[3];
  const overloaded = [{ nodes: ["S", "A", "C", "T"], amount: 3 }, { nodes: ["S", "B", "C", "T"], amount: 2 }];
  assert.match(analyze(mission, overloaded).errors.join(" "), /桥头站.*河岸站.*容量只有 4/);
  assert.throws(() => execute(mission, overloaded, ["S"]), /容量/);
  assert.match(analyze({ ...mission, supply: 5 }, mission.reference).errors.join(" "), /总仓只有/);
  assert.match(analyze({ ...mission, budget: 19 }, mission.reference).errors.join(" "), /预算/);
  for (const value of [null, {}, { nodes: ["S", "T"], amount: 1 }, { nodes: ["S", "A", "S", "A", "T"], amount: 1 },
    { nodes: ["S", "A", "T"], amount: 0 }, { nodes: ["S", "A", "T"], amount: 1.5 },
    { nodes: ["S", "A", "T"], amount: NaN }, { nodes: ["T", "A", "S"], amount: 1 }]) {
    assert.ok(routeError(mission, value));
  }
  assert.ok(analyze(mission, Array(65).fill(mission.reference[0])).errors.length);
  const second = MISSIONS[1];
  const poor = [{ nodes: ["S", "T"], amount: 1 }];
  assert.equal(analyze(second, poor).errors.length, 0);
  assert.equal(execute(second, poor, ["S"]).passed, false, "a legal expensive choice executes and fails its learning target");
  assert.equal(execute(MISSIONS[0], [], ["S"]).passed, false);
});

test("residual adjustments undo the shared route and decompose into executable routes", () => {
  const mission = MISSIONS[4];
  const before = cloneRoutes(mission.seed);
  assert.equal(analyze(mission, before).total, 3);
  assert.equal(analyze(mission, before).cost, 6);
  assert.equal(moves(mission, before, false).some((move) => move.from === "S"), true);
  assert.equal(moves(mission, before, true).find((move) => move.code === "-AB").available, 3);
  assert.deepEqual(walk(mission, ["SB", "-AB", "AT"]), ["S", "B", "A", "T"]);
  const partial = adjust(mission, before, ["SB", "-AB", "AT"], 1);
  assert.equal(analyze(mission, partial).total, 4);
  assert.equal(analyze(mission, partial).flow.AB, 2);
  assert.equal(analyze(mission, partial).cost, 10);
  const after = adjust(mission, partial, ["SB", "-AB", "AT"], 2);
  assert.deepEqual(analyze(mission, after), analyze(mission, mission.reference));
  assert.equal(execute(mission, after, ["S"]).passed, true);
  assert.deepEqual(before, mission.seed, "adjustment never mutates the input");
  for (const [codes, amount] of [[["SB", "-AB", "AT"], 4], [["SB", "-AB", "AT"], 0], [["SB"], 1], [["SA", "-SA", "SB", "BT"], 1]]) {
    assert.throws(() => adjust(mission, before, codes, amount));
  }
  assert.equal(walk(mission, ["unknown"]), null);
  assert.equal(walk(mission, [null]), null);
  assert.equal(walk(mission, ["AT"]), null);
});

test("cuts count only outbound capacity; equal flow and cut certify the actual maximum", () => {
  for (const mission of MISSIONS.filter((item) => item.certificate)) {
    const variable = mission.places.filter((place) => place.id !== mission.source && !place.need);
    let minimum = Infinity;
    for (let mask = 0; mask < 2 ** variable.length; mask++) {
      const side = [mission.source, ...variable.filter((_, index) => mask & 2 ** index).map((place) => place.id)];
      const cut = cutFor(mission, side);
      minimum = Math.min(minimum, cut.capacity);
      assert.ok(analyze(mission, mission.reference).total <= cut.capacity);
    }
    assert.equal(minimum, analyze(mission, mission.reference).total);
    assert.equal(execute(mission, mission.reference, [mission.source]).passed, false);
    assert.equal(cutFor(mission, []), null);
    assert.equal(cutFor(mission, ["S", "T"]), null);
    assert.equal(cutFor(mission, ["S", "S"]), null);
    assert.equal(cutFor(mission, ["S", "unknown"]), null);
  }
  const third = MISSIONS[4];
  assert.deepEqual(cutFor(third, ["S", "B"]), { capacity: 6, edges: ["SA", "BT"] }, "A → B crosses into the source side and is not counted");
});

test("delivery is judged separately by receiver; equal total is insufficient", () => {
  const mission = MISSIONS[7];
  const unbalanced = [
    { nodes: ["S", "A", "T"], amount: 2 }, { nodes: ["S", "A", "C", "T"], amount: 3 },
    { nodes: ["S", "A", "C", "U"], amount: 1 }, { nodes: ["S", "B", "C", "U"], amount: 2 },
    { nodes: ["S", "B", "D", "U"], amount: 3 },
  ];
  const result = execute(mission, unbalanced, ["S"]);
  assert.equal(result.analysis.total, 11);
  assert.equal(result.analysis.delivered.U, 6);
  assert.equal(result.passed, false);
  assert.match(result.failures.join(" "), /河岸站.*还缺 1/);
});

test("each tutorial gates its current experiment, accepts alternate operations and restores every step", () => {
  const storage = memory();
  for (const mission of MISSIONS) {
    const save = freshSave();
    startChapter(save, mission.id);
    while (guideStep(save.guide, mission.id) !== "dispatch") {
      const step = guideStep(save.guide, mission.id);
      if (step !== "arrival") {
        assert.equal(advanceGuide(save.guide, mission, save.routes, save.side), false);
        assert.ok(guideText(step));
      }
      if (step === "route" || step === "cost" || step === "flow") save.routes = cloneRoutes(mission.reference);
      if (step === "capacity") save.guide.observed = true;
      if (step === "residual") {
        save.routes = adjust(mission, save.routes, ["SB", "-AB", "AT"], 3);
        save.guide.reversed = true;
      }
      if (step === "cut") save.side = [...mission.referenceCut];
      assert.equal(guideReady(save.guide, mission, save.routes, save.side), true);
      writeSave("guide", save, storage);
      assert.deepEqual(readSave("guide", storage), save);
      assert.equal(advanceGuide(save.guide, mission, save.routes, save.side), true);
    }
    assert.equal(save.guide.step, guideLength(mission.id));
  }
  const guide = freshGuide();
  guide.step = 1;
  assert.equal(guideReady(guide, MISSIONS[1], [{ nodes: ["S", "T"], amount: 1 }], ["S"]), true,
    "teaching cost does not force a unique route");
});

test("save restores unfinished residual paths, drafts, cuts, scores, hints and execution from verified inputs", () => {
  const storage = memory();
  const save = freshSave();
  startChapter(save, 5);
  save.editing = "residual";
  save.codes = ["SB", "-AB"];
  save.amount = 2;
  save.guide.step = 1;
  save.mode = "desk";
  writeSave("normal", save, storage);
  assert.deepEqual(readSave("normal", storage), save);
  startChapter(save, 6);
  save.routes = cloneRoutes(MISSIONS[5].reference);
  save.side = [...MISSIONS[5].referenceCut];
  save.result = execute(MISSIONS[5], save.routes, save.side);
  recordScore(save);
  assert.equal(save.solo[6], 3);
  save.result.analysis.cost = 0;
  writeSave("normal", save, storage);
  assert.equal(readSave("normal", storage).result.analysis.cost, 15);
  save.hinted = true;
  save.hintLevel = 3;
  recordScore(save);
  assert.equal(save.solo[6], 3, "using a hint later preserves independent best");
  startChapter(save, 1);
  assert.equal(save.best[6], 3);
  assert.equal(save.unlocked, 7);
  writeSave("test", save, storage);
  assert.equal(readSave("normal", storage).activeId, 6);
  assert.equal(readSave("test", storage).activeId, 1);
  const blocked = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  assert.equal(readSave("x", blocked).activeId, 1);
  assert.equal(writeSave("x", save, blocked), false);
  for (const data of ["{", JSON.stringify({ version: 99 }), JSON.stringify({ version: 1, activeId: 6, routes: [null] })]) {
    storage.setItem("broken", data);
    assert.equal(readSave("broken", storage).result, null);
  }
  const overloaded = freshSave();
  startChapter(overloaded, 3);
  overloaded.routes = [{ nodes: ["S", "A", "T"], amount: 3 }];
  overloaded.result = { passed: true, stars: 3 };
  writeSave("over", overloaded, storage);
  const restored = readSave("over", storage);
  assert.deepEqual(restored.routes, overloaded.routes, "unfinished over-capacity draft can be repaired after reload");
  assert.equal(restored.result, null);
  assert.deepEqual(restored.best, {});
});
