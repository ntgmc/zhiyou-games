import test from "node:test";
import assert from "node:assert/strict";
import { analyze, defaultPlan, deviceProbability, execute, missionError, samplePosterior } from "../.build/src/games/probability/engine.js";
import { MISSIONS } from "../.build/src/games/probability/missions.js";
import { advanceGuide, freshGuide, guideLength, guideStep, renderGuide } from "../.build/src/games/probability/story.js";
import { renderResult } from "../.build/src/games/probability/results.js";
import { freshSave, readSave, recordScore, startChapter } from "../.build/src/games/probability/storage.js";
import { archiveChapter, resumeChapter } from "../.build/src/shared/chapter-drafts.js";
import { exportBackup, importBackup } from "../.build/src/shared/save-backup.js";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function options(job) {
  if (job.kind === "batch") return Array.from({ length: job.maxSamples + 1 }, (_, samples) =>
    Array.from({ length: samples + 2 }, (_, cutoff) => ({ ...defaultPlan(), samples, cutoff }))).flat();
  return ["keep", "replace"].map(red => ({ ...defaultPlan(), red }))
    .concat(job.detectors.flatMap(detector => ["keep", "replace"].flatMap(red =>
      ["keep", "replace"].map(green => ({ ...defaultPlan(), detectorId: detector.id, red, green })))));
}
// Enumerate attainable resource totals instead of the exponential product of twelve policy lists.
function optimum(mission) {
  let states = new Map([["0/0", { cost: 0, work: 0, expected: 0 }]]);
  for (const job of mission.cases) {
    const next = new Map();
    for (const state of states.values()) for (const plan of options(job)) {
      const a = analyze(job, plan), cost = state.cost + a.cost, work = state.work + a.work;
      if (cost > mission.budget || work > mission.work) continue;
      const key = `${cost}/${work}`, expected = state.expected + a.expected;
      if (!next.has(key) || next.get(key).expected > expected) next.set(key, { cost, work, expected });
    }
    states = next;
  }
  return Math.min(...Array.from(states.values(), state => state.expected));
}

test("all sixteen new chapters have real independent decisions and resource-verified three-star solutions", () => {
  assert.deepEqual(MISSIONS.map(m => m.id), Array.from({ length: 24 }, (_, i) => i + 1));
  const expected = [9.415929203539824, 9.874084507042249, 24.14089552238806, 174.720469375,
    20.072, 18.016, 188.886352, 64.574656, 97.6149800294303, 234.26232416,
    200.2945, 127.60459552238806, 346.2253043738451, 244.56056416, 312.90719551, 399.4326818885853];
  for (const mission of MISSIONS.slice(8)) {
    assert.equal(mission.reference.length, mission.cases.length);
    assert.equal(new Set(mission.cases.map(job => job.id)).size, mission.cases.length);
    assert.equal(mission.hints.length, 3);
    assert.ok(mission.opening && mission.recap);
    const guide = freshGuide();
    assert.equal(guideStep(guide, mission.id), "arrival");
    assert.ok(renderGuide(guide, mission).includes("由你来定"));
    assert.equal(advanceGuide(guide, mission.id), true);
    assert.equal(guideStep(guide, mission.id), "dispatch");
    assert.equal(guideLength(mission.id), 1);
    const result = execute(mission, mission.reference);
    assert.equal(result.stars, 3, `chapter ${mission.id}`);
    close(result.expected, expected[mission.id - 9]);
    close(result.expected, optimum(mission));
    assert.ok(result.cost <= mission.budget && result.work <= mission.work);
    const html = renderResult(mission, mission.reference, result, false, mission.id === 24);
    assert.ok(html.includes(mission.recap));
    assert.ok(!html.includes("首版"));
    assert.equal(html.includes('data-command="next"'), mission.id < 24);
  }
});

test("base rates, green reports and copied measurements cause different actual policy decisions", () => {
  const m9 = MISSIONS[8];
  assert.ok(deviceProbability(m9.cases[0]) < 0.02);
  assert.ok(deviceProbability(m9.cases[1]) > 0.9);
  for (const red of ["keep", "replace"]) assert.equal(execute(m9, m9.cases.map(() => ({ ...defaultPlan(), red }))).passed, false);
  const m10 = MISSIONS[9];
  assert.ok(deviceProbability(m10.cases[0]) > 0.19);
  assert.equal(execute(m10, m10.cases.map(defaultPlan)).passed, false);
  const m11 = MISSIONS[10];
  close(deviceProbability(m11.cases[0]), 18 / 67);
  assert.ok(deviceProbability(m11.cases[1]) > 0.86);
  const swapped = [...m11.reference].reverse();
  assert.equal(missionError(m11, swapped), null);
  assert.equal(execute(m11, swapped).passed, false);
});

test("batch thresholds use posterior losses, and full branch weighting agrees with a direct mixture calculation", () => {
  const mission = MISSIONS[11];
  assert.deepEqual(mission.reference.map(p => p.cutoff), [2, 3]);
  mission.cases.forEach((job, i) => {
    const plan = mission.reference[i];
    const a = analyze(job, plan);
    let expected = plan.samples * job.sampleCost;
    for (let k = 0; k <= plan.samples; k++) {
      const combinations = [1, 4, 6, 4, 1][k];
      for (let state = 0; state < job.rates.length; state++) {
        const rate = job.rates[state];
        const mass = job.weights[state] * combinations * rate ** k * (1 - rate) ** (4 - k);
        expected += mass * job.count * (k >= plan.cutoff ? job.replaceCost : rate * job.faultLoss);
      }
      const posterior = samplePosterior(job, 4, k);
      assert.equal(a.branches[k].action, posterior.fault * job.faultLoss >= job.replaceCost ? "replace" : "keep");
    }
    close(a.expected, expected);
  });
  assert.equal(execute(mission, mission.reference.map(p => ({ ...p, cutoff: 1 }))).passed, false);
  assert.equal(execute(mission, mission.reference.map(p => ({ ...p, cutoff: 3 }))).passed, false);
});

test("cheap high-work tools, scarce samples and unnecessary investigations change the full duty", () => {
  const work = MISSIONS[13];
  const precise = work.reference.map((p, i) => i === 0 ? { ...p, detectorId: "precise" } : p);
  assert.match(missionError(work, precise), /工时/);
  const samples = MISSIONS[14];
  assert.match(missionError(samples, samples.cases.map(() => ({ ...defaultPlan(), samples: 4 }))), /预算/);
  const idle = execute(MISSIONS[15], MISSIONS[15].reference);
  assert.ok(idle.cost < MISSIONS[15].budget && idle.work < MISSIONS[15].work);
  const final = MISSIONS[23];
  const perCaseBest = final.cases.map(job => options(job).sort((a, b) => analyze(job, a).expected - analyze(job, b).expected)[0]);
  assert.ok(missionError(final, perCaseBest));
  const mostGain = final.cases.map(job => options(job).filter(p => analyze(job, p).cost === 0)
    .sort((a, b) => analyze(job, a).expected - analyze(job, b).expected)[0]);
  while (true) {
    const choices = final.cases.flatMap((job, i) => options(job).map(plan => {
      const trial = mostGain.map((p, index) => index === i ? plan : p);
      return { i, plan, gain: analyze(job, mostGain[i]).expected - analyze(job, plan).expected, trial };
    }).filter(choice => choice.gain > 1e-9 && !missionError(final, choice.trial))).sort((a, b) => b.gain - a.gain);
    if (!choices.length) break;
    mostGain[choices[0].i] = choices[0].plan;
  }
  assert.equal(execute(final, mostGain).passed, false, "largest immediate improvement strands the other jobs");
});

test("the final duty accepts alternative three-star and two-star strategies and rejects uniform policies", () => {
  const mission = MISSIONS[23];
  assert.equal(mission.cases.length, 12);
  const alternate = mission.reference.map(p => ({ ...p }));
  alternate[5] = { ...defaultPlan(), detectorId: "cheap", red: "replace" };
  alternate[8] = { ...defaultPlan(), samples: 2, cutoff: 1 };
  assert.equal(execute(mission, alternate).stars, 3);
  close(execute(mission, alternate).expected, 399.4786898885852);
  const two = mission.reference.map((p, i) => i === 8 ? { ...p, samples: 2 } : p);
  assert.equal(execute(mission, two).stars, 2);
  close(execute(mission, two).expected, 401.4996898885853);
  for (const detectorId of ["", "screen", "precise", "cheap"]) for (const red of ["keep", "replace"]) for (const green of ["keep", "replace"]) {
    for (let samples = 0; samples <= 4; samples++) for (let cutoff = 0; cutoff <= samples + 1; cutoff++) {
      const plans = mission.cases.map(job => job.kind === "batch" ? { ...defaultPlan(), samples, cutoff }
        : { ...defaultPlan(), detectorId: job.detectors.some(d => d.id === detectorId) ? detectorId : "", red, green });
      if (!missionError(mission, plans)) assert.equal(execute(mission, plans).passed, false);
    }
  }
});

test("old chapter eight continues to nine; every new guide, unfinished plan, result and chapter backup restores", () => {
  let save = freshSave();
  startChapter(save, 8);
  save.plans = MISSIONS[7].reference.map(p => ({ ...p }));
  save.guide.step = guideLength(8);
  save.result = execute(MISSIONS[7], save.plans);
  recordScore(save);
  assert.equal(readSave("old", { getItem: () => JSON.stringify(save) }).unlocked, 9);
  for (const mission of MISSIONS.slice(8)) {
    startChapter(save, mission.id);
    assert.deepEqual(readSave("arrival", { getItem: () => JSON.stringify(save) }), save);
    advanceGuide(save.guide, mission.id);
    for (let i = 0; i < mission.cases.length; i++) {
      save.plans[i] = { ...mission.reference[i] };
      const restored = readSave("draft", { getItem: () => JSON.stringify(save) });
      assert.deepEqual(restored, save);
    }
    save.result = execute(mission, save.plans);
    recordScore(save);
    save = readSave("result", { getItem: () => JSON.stringify(save) });
    assert.equal(save.best[mission.id], 3);
    assert.equal(save.solo[mission.id], 3);
  }
  const pristine = structuredClone(save);
  save.chapters = archiveChapter(save);
  startChapter(save, 12);
  const restored = resumeChapter(save, 24, readSave, { best: save.best, solo: save.solo, unlocked: save.unlocked, mode: save.mode });
  assert.deepEqual(restored.plans, pristine.plans);
  assert.deepEqual(restored.result, pristine.result);
  const backup = exportBackup("probability", restored, readSave);
  assert.deepEqual(importBackup(backup, "probability", readSave), restored);
  const forged = { ...restored, result: { ...restored.result, expected: 0, actual: 0, stars: 99 } };
  assert.deepEqual(readSave("forged", { getItem: () => JSON.stringify(forged) }).result, restored.result);
  startChapter(save, 24);
  save.hinted = true;
  save.hintLevel = 1;
  save.plans = MISSIONS[23].reference.map(p => ({ ...p }));
  save.result = execute(MISSIONS[23], save.plans);
  recordScore(save);
  assert.equal(save.solo[24], 3, "a hinted retry preserves the existing independent result");
});
