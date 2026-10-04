import test from "node:test";
import assert from "node:assert/strict";
import { analyze, binomial, defaultPlan, deviceProbability, execute, missionError, planError, sampleObservations, samplePosterior, update } from "../.build/src/games/probability/engine.js";
import { MISSIONS, PRECISE, SCREEN } from "../.build/src/games/probability/missions.js";
import { advanceGuide, freshGuide, guideAction, guideLength, guideReady, guideStep, readGuide, renderGuide, renderHints } from "../.build/src/games/probability/story.js";
import { renderResult } from "../.build/src/games/probability/results.js";
import { freshSave, readSave, recordScore, startChapter, writeSave } from "../.build/src/games/probability/storage.js";

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const plansFor = (job) => {
  if (job.kind === "batch") return Array.from({ length: job.maxSamples + 1 }, (_, samples) =>
    Array.from({ length: samples + 2 }, (_, cutoff) => ({ ...defaultPlan(), samples, cutoff }))).flat();
  return ["keep", "replace"].map((red) => ({ ...defaultPlan(), red }))
    .concat(job.detectors.flatMap((detector) => ["keep", "replace"].flatMap((red) =>
      ["keep", "replace"].map((green) => ({ ...defaultPlan(), detectorId: detector.id, red, green })))));
};
const combinations = (groups) => groups.reduce((all, group) => all.flatMap((prefix) => group.map((plan) => [...prefix, plan])), [[]]);
const memory = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test("Bayesian updating uses the right denominator and handles endpoints", () => {
  const first = update(0.02, 0.9, 0.05, true);
  close(first.chance, 0.067);
  close(first.fault, 18 / 67);
  close(update(first.fault, 0.95, 0.01, true).fault, 0.972143263217737);
  close(update(first.fault, 0.95, 0.01, false).fault, 0.0182149362477231);
  for (const p of [0, 1]) for (const s of [0, 1]) for (const f of [0, 1]) for (const red of [true, false]) {
    const result = update(p, s, f, red);
    assert.ok(Number.isFinite(result.fault));
    assert.ok(result.chance >= 0 && result.chance <= 1);
  }
  for (const bad of [-1, 2, NaN, Infinity]) assert.throws(() => update(bad, 0.9, 0.05, true), /概率/);
  const device = MISSIONS[2].cases[0];
  const precise = { source: "new measurement", title: "new", detector: PRECISE, red: false };
  close(deviceProbability({ ...device, evidence: [...device.evidence, precise] }), update(first.fault, 0.95, 0.01, false).fault);
});

test("copies of the same measurement add no evidence; new measurements do", () => {
  const single = MISSIONS[2].cases[0];
  const copied = MISSIONS[5].cases[0];
  close(deviceProbability(single), deviceProbability(copied));
  close(analyze(single, MISSIONS[2].reference[0]).expected, analyze(copied, MISSIONS[5].reference[0]).expected);
  const independent = { ...single, evidence: [...single.evidence, { ...single.evidence[0], source: "another measurement" }] };
  assert.ok(deviceProbability(independent) > deviceProbability(copied));
  assert.throws(() => deviceProbability({ ...single, evidence: [...single.evidence, { ...single.evidence[0], red: false }] }), /矛盾/);
});

test("complete branch policies include investigation costs and change with price", () => {
  close(execute(MISSIONS[2], MISSIONS[2].reference).expected, 6.956417910447762);
  const costly = analyze(MISSIONS[3].cases[0], MISSIONS[2].reference[0]);
  close(costly.expected, 13.956417910447762);
  assert.equal(execute(MISSIONS[3], MISSIONS[2].reference).passed, false);
  assert.equal(execute(MISSIONS[3], MISSIONS[3].reference).passed, true);
  const badBranch = { ...MISSIONS[2].reference[0], green: "replace" };
  close(analyze(MISSIONS[2].cases[0], badBranch).expected, 15);
  assert.equal(execute(MISSIONS[2], [badBranch]).passed, false);
  const job = { ...MISSIONS[0].cases[0], prior: 1, detectors: [{ ...SCREEN, sensitivity: 1, falseAlarm: 0 }] };
  assert.doesNotThrow(() => execute({ ...MISSIONS[0], cases: [job] }, [{ ...defaultPlan(), detectorId: "screen", red: "replace" }]));
});

test("batch posterior and binomial mixture agree across all sample outcomes", () => {
  const batch = MISSIONS[6].cases[0];
  for (let n = 0; n <= batch.maxSamples; n++) {
    let mass = 0;
    let faultMean = 0;
    for (let k = 0; k <= n; k++) {
      const posterior = samplePosterior(batch, n, k);
      mass += posterior.chance;
      faultMean += posterior.chance * posterior.fault;
      close(posterior.weights.reduce((a, b) => a + b, 0), 1);
      for (let i = 0; i < batch.rates.length; i++) {
        close(posterior.chance * posterior.weights[i], batch.weights[i] * binomial(n, k, batch.rates[i]));
      }
    }
    close(mass, 1);
    close(faultMean, 0.1);
    close(analyze(batch, { ...defaultPlan(), samples: n, cutoff: 0 }).expected, n + 60);
    close(analyze(batch, { ...defaultPlan(), samples: n, cutoff: n + 1 }).expected, n + 60);
  }
  const noFault = samplePosterior(batch, 4, 0);
  assert.ok(noFault.fault > 0 && noFault.fault < 0.1);
  const fourFaults = samplePosterior(batch, 4, 4);
  assert.ok(fourFaults.weights[2] > batch.weights[2]);
  assert.throws(() => samplePosterior(batch, 5, 1));
  assert.throws(() => samplePosterior(batch, 2, 3));
  assert.throws(() => binomial(-1, 0, 0.2));
  assert.deepEqual(sampleObservations(batch, 99, 2), sampleObservations(batch, 99, 4).slice(0, 2));
});

test("all eight foundational references execute at three stars; exhaustive legal policies validate targets", () => {
  assert.equal(MISSIONS.length, 24);
  const expected = [2.92, 12, 6.956417910447762, 12, 8.832, 6.956417910447762, 47.62556416, 55.58198207044776];
  const winningCounts = [];
  for (const mission of MISSIONS.slice(0, 8)) {
    const result = execute(mission, mission.reference);
    close(result.expected, expected[mission.id - 1]);
    assert.equal(result.stars, 3, `chapter ${mission.id}`);
    assert.equal(result.outcomes.length, mission.cases.length);
    let winning = 0;
    let minimum = Infinity;
    for (const plans of combinations(mission.cases.map(plansFor))) {
      if (missionError(mission, plans)) continue;
      const trial = execute(mission, plans);
      minimum = Math.min(minimum, trial.expected);
      if (trial.passed) winning++;
    }
    assert.ok(winning > 0);
    close(minimum, result.expected);
    winningCounts.push(winning);
  }
  assert.ok(winningCounts[7] > 1, "independent duty accepts different sufficient policies");
  for (const action of ["keep", "replace"]) {
    assert.ok(MISSIONS.some((mission) => !execute(mission, mission.cases.map((job) =>
      job.kind === "batch" ? { ...defaultPlan(), cutoff: action === "replace" ? 0 : 1 } : { ...defaultPlan(), red: action })).passed),
    `always ${action} cannot solve the whole game`);
  }
});

test("budget and work limits are hard constraints; poor but legal choices execute", () => {
  const duty = MISSIONS[7];
  const overloaded = duty.reference.map((plan) => ({ ...plan }));
  overloaded[1] = { ...defaultPlan(), detectorId: "cheap", red: "replace", green: "keep" };
  assert.match(missionError(duty, overloaded), /预算/);
  assert.throws(() => execute(duty, overloaded), /预算/);
  assert.match(missionError({ ...duty, budget: 10, work: 5 }, duty.reference), /工时/);
  assert.equal(missionError(MISSIONS[2], [defaultPlan()]), null);
  assert.equal(execute(MISSIONS[2], [defaultPlan()]).passed, false);
  assert.match(missionError(duty, []), /每份/);
  assert.match(planError(duty.cases[0], null), /格式/);
  assert.match(planError(duty.cases[0], { ...defaultPlan(), detectorId: "unknown" }), /不可用/);
  assert.match(planError(duty.cases[2], { ...defaultPlan(), samples: 4, cutoff: 6 }), /格式/);
});

test("score measures complete strategy; actual results are fixed by job and detector", () => {
  const mission = MISSIONS[7];
  assert.deepEqual(execute(mission, mission.reference), execute(mission, mission.reference));
  const reversed = execute({ ...mission, cases: [...mission.cases].reverse() }, [...mission.reference].reverse());
  assert.deepEqual(reversed.outcomes, [...execute(mission, mission.reference).outcomes].reverse());
  const actuals = new Set();
  for (let seed = 0; seed < 40; seed++) {
    const trial = execute({ ...mission, seed }, mission.reference);
    close(trial.expected, 55.58198207044776);
    assert.equal(trial.stars, 3);
    actuals.add(trial.actual);
  }
  assert.ok(actuals.size > 1);
});

test("tutorials require observations and preserve every current step on restore", () => {
  const storage = memory();
  for (const mission of MISSIONS) {
    const save = freshSave();
    startChapter(save, mission.id);
    while (guideStep(save.guide, mission.id) !== "dispatch") {
      const step = guideStep(save.guide, mission.id);
      if (step !== "arrival") assert.equal(advanceGuide(save.guide, mission.id), false);
      if (step === "population" || step === "filter") guideAction(save.guide, mission.id, "filter");
      if (step === "frequency") guideAction(save.guide, mission.id, "draw");
      if (step === "update") {
        guideAction(save.guide, mission.id, "red");
        assert.equal(guideReady(save.guide, mission.id), false);
        guideAction(save.guide, mission.id, "green");
      }
      if (step === "cost" || step === "tools") guideAction(save.guide, mission.id, "compare");
      if (step === "source") guideAction(save.guide, mission.id, "trace");
      if (step === "sample") guideAction(save.guide, mission.id, "sample");
      assert.equal(writeSave("test", save, storage), true);
      assert.deepEqual(readSave("test", storage).guide, save.guide);
      assert.ok(renderGuide(save.guide, mission).includes(mission.title));
      assert.equal(advanceGuide(save.guide, mission.id), true);
    }
    assert.equal(save.guide.step, guideLength(mission.id));
    assert.equal(advanceGuide(save.guide, mission.id), false);
  }
  const guide = freshGuide();
  assert.equal(guideAction(guide, 1, "sample"), false);
  assert.equal(readGuide({ step: Infinity, runs: -1, samples: 999 }, 1).step, 0);
});

test("save roundtrip rebuilds outcomes, keeps achievements and isolates test profiles", () => {
  const storage = memory();
  const save = freshSave();
  startChapter(save, 8);
  save.plans = MISSIONS[7].reference.map((plan) => ({ ...plan }));
  save.result = execute(MISSIONS[7], save.plans);
  save.guide.step = guideLength(8);
  recordScore(save);
  writeSave("normal", save, storage);
  assert.deepEqual(readSave("normal", storage), save);
  const poisoned = JSON.parse(storage.getItem("normal"));
  poisoned.result.expected = -1000;
  poisoned.result.actual = -1000;
  poisoned.result.stars = 99;
  storage.setItem("forged", JSON.stringify(poisoned));
  assert.deepEqual(readSave("forged", storage).result, save.result);
  poisoned.plans[0].detectorId = "missing";
  storage.setItem("damaged", JSON.stringify(poisoned));
  const recovered = readSave("damaged", storage);
  assert.deepEqual(recovered.best, { 8: 3 });
  assert.deepEqual(recovered.solo, { 8: 3 });
  assert.equal(recovered.result, null);
  startChapter(save, 1);
  assert.deepEqual(save.best, { 8: 3 });
  writeSave("test", save, storage);
  assert.equal(readSave("normal", storage).activeId, 8);
  assert.equal(readSave("test", storage).activeId, 1);
  save.hinted = true;
  save.hintLevel = 1;
  save.plans = MISSIONS[0].reference.map((plan) => ({ ...plan }));
  save.result = execute(MISSIONS[0], save.plans);
  recordScore(save);
  assert.equal(save.solo[1], undefined);
  assert.equal(save.best[1], 3);
  const unavailable = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.deepEqual(readSave("x", unavailable), freshSave());
  assert.equal(writeSave("x", save, unavailable), false);
  storage.setItem("invalid", "{");
  assert.deepEqual(readSave("invalid", storage), freshSave());
  storage.setItem("invalid", JSON.stringify({ ...save, version: 999 }));
  assert.deepEqual(readSave("invalid", storage), freshSave());
});

test("settlement explains average scoring and itemizes the actual costs without changing outcomes", () => {
  for (const mission of MISSIONS) {
    for (const plans of [mission.reference, mission.cases.map(defaultPlan)]) {
      const result = execute(mission, plans);
      const html = renderResult(mission, plans, result, false, mission.id === MISSIONS.length);
      let replacement = 0;
      let faults = 0;
      result.outcomes.forEach((outcome, i) => {
        const job = mission.cases[i];
        if (outcome.action === "replace") replacement += (job.kind === "batch" ? job.count : 1) * job.replaceCost;
        else faults += outcome.faults * job.faultLoss;
      });
      close(result.cost + replacement + faults, result.actual);
      const format = (n) => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(n);
      assert.ok(html.includes(`${format(result.cost)} 点调查费 + ${format(replacement)} 点更换费 + ${format(faults)} 点故障损失`));
      assert.ok(html.includes(`平均损失 ${format(result.expected)} 点计算`));
      assert.ok(html.indexOf("return-list") < html.indexOf("本章笔记"));
      assert.ok(html.indexOf("本章笔记") < html.indexOf("评分用的平均损失"));
      assert.ok(!html.includes("单次结果不决定方案成绩"));
      assert.ok(html.includes(result.passed ? "这份方案通过了" : "再调整一下方案"));
    }
  }
});

test("hint entry is compact and opening it displays the first hint without exposing later answers", () => {
  const mission = MISSIONS[7];
  const collapsed = renderHints(mission, 0, false);
  assert.ok(collapsed.includes('aria-expanded="false"'));
  assert.ok(!collapsed.includes("hint-content"));
  assert.ok(!collapsed.includes(mission.hints[0]));
  const first = renderHints(mission, 1, true);
  assert.ok(first.includes('aria-expanded="true"'));
  assert.ok(first.includes(mission.hints[0]));
  assert.ok(!first.includes(mission.hints[1]));
  assert.ok(!first.includes(mission.hints[2]));
  assert.ok(first.includes("查看关键条件"));
  const complete = renderHints(mission, 3, true);
  mission.hints.forEach((hint) => assert.ok(complete.includes(hint)));
  assert.ok(!complete.includes('data-command="hint-next"'));
});
