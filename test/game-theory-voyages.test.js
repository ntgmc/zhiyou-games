import test from "node:test";
import assert from "node:assert/strict";
import { analyze, createSession, defaultPlan, planError, settle, stars } from "../.build/src/games/game-theory/engine.js";
import { MISSIONS } from "../.build/src/games/game-theory/missions.js";
import { advanceGuide, freshGuide, guideStep, renderGuide } from "../.build/src/games/game-theory/story.js";
import { resultFeedback } from "../.build/src/games/game-theory/results.js";
import { freshSave, readSave, recordScore } from "../.build/src/games/game-theory/storage.js";

const contract = (deposit, transfer = 0) => ({ ...defaultPlan(), contract: true, deposit, transfer });
function run(mission, plans) {
  let session = createSession(mission);
  for (const plan of plans) {
    if (planError(session, mission, plan)) return session;
    session = settle(session, mission, plan);
  }
  return session;
}
function greedy(mission, mode) {
  let session = createSession(mission);
  while (session.status === "playing") {
    const choices = [];
    for (let deposit = 0; deposit <= 12; deposit++) for (let transfer = -4; transfer <= 4; transfer++) {
      const plan = contract(deposit, transfer);
      if (planError(session, mission, plan)) continue;
      const analysis = analyze(mission.rounds[session.step], session.cash, plan);
      if (analysis.accepted && analysis.stable && analysis.opponent === "cooperate") choices.push({ plan, profit: analysis.cooperation[0] });
    }
    choices.sort((a, b) => mode === "minimum-deposit"
      ? a.plan.deposit - b.plan.deposit || b.profit - a.profit
      : b.profit - a.profit || a.plan.deposit - b.plan.deposit);
    if (!choices.length) return session;
    session = settle(session, mission, choices[0].plan);
  }
  return session;
}

test("new harbor chapters hand over real decisions and have complete feedback, forecasts and three-star plans", () => {
  assert.deepEqual(MISSIONS.map(mission => mission.id), Array.from({ length: 24 }, (_, index) => index + 1));
  assert.deepEqual(MISSIONS.slice(16).map(mission => mission.rounds.length), [6, 8, 4, 10, 12, 14, 18, 24]);
  for (const mission of MISSIONS.slice(16)) {
    const guide = freshGuide();
    const session = createSession(mission);
    assert.equal(guideStep(guide, mission, session), "arrival");
    assert.match(renderGuide(guide, mission, session, ""), new RegExp(mission.title));
    advanceGuide(guide, mission, session);
    assert.equal(guideStep(guide, mission, session), "dispatch");
    assert.equal(mission.reference.length, mission.rounds.length);
    assert.equal(mission.hints.length, 3);
    assert.ok(mission.rounds.every(round => round.briefing && round.title));
    const finished = run(mission, mission.reference);
    assert.equal(stars(finished, mission), 3, `chapter ${mission.id}`);
    assert.equal(finished.total[0], mission.goal);
    assert.equal(resultFeedback(finished, mission).failure, "");
    assert.ok(resultFeedback(finished, mission).reply);
  }
});

test("outside quotes and changing fees have consequences beyond this round", () => {
  const quotes = MISSIONS[16];
  const rejected = settle(createSession(quotes), quotes, contract(5, 2));
  assert.equal(rejected.history[0].accepted, false);
  assert.match(rejected.history[0].reason, /替代航线/);
  assert.equal(rejected.deposits, 0);
  assert.deepEqual(rejected.cash, [18, 23]);
  assert.notEqual(run(quotes, quotes.reference.map(plan => ({ ...plan, transfer: 0 }))).status, "won");
  const fees = MISSIONS[17];
  const completed = run(fees, fees.reference);
  assert.deepEqual(completed.cash, [69, 71]);
  assert.deepEqual(completed.history.map(item => item.payoff[0]), [2, 10, 4, 12, 2, 10, 6, 8]);
  const immediateProfit = greedy(fees, "maximum-profit");
  assert.equal(immediateProfit.step, 2);
  assert.deepEqual(immediateProfit.cash, [29, 24]);
  assert.equal(analyze(fees.rounds[2], immediateProfit.cash, fees.reference[2]).accepted, false);
  assert.equal(planError(immediateProfit, fees, fees.reference[2]), null);
});

test("new relationship prices require both parties' incentives, including the weak boundary", () => {
  const mission = MISSIONS[18];
  const mutual = mission.reference[0];
  const analyses = mission.rounds.map(round => analyze(round, mission.cash, mutual));
  assert.deepEqual(analyses.map(item => item.stable), [true, false, true, false]);
  assert.deepEqual(analyses[0].cooperation, [14, 14]);
  assert.deepEqual(analyses[0].deviation, [14, 14]);
  assert.deepEqual(analyses[1].cooperation, [12, 16]);
  assert.deepEqual(analyses[1].deviation, [12, 18]);
  assert.deepEqual(analyses[3].cooperation, [20, 20]);
  assert.deepEqual(analyses[3].deviation, [21, 21]);
  assert.equal(run(mission, mission.rounds.map(() => mutual)).status, "lost");
  const finished = run(mission, mission.reference);
  assert.deepEqual(finished.total, [56, 64]);
  assert.deepEqual(finished.cash, mission.cash);
  assert.deepEqual(finished.history.map(item => item.payoff[0]), [14, 6, 24, 12]);
});

test("independent handovers defeat both local heuristics without locking the reference plan", () => {
  for (const id of [20, 21, 22, 24]) {
    const mission = MISSIONS[id - 1];
    for (const mode of ["minimum-deposit", "maximum-profit"]) {
      const session = greedy(mission, mode);
      assert.notEqual(session.status, "won", `${id}/${mode}`);
      assert.ok(session.step < mission.rounds.length);
    }
  }
  const mission = MISSIONS[23];
  for (let deposit = 0; deposit <= 12; deposit++) for (let transfer = -4; transfer <= 4; transfer++) {
    assert.notEqual(run(mission, mission.rounds.map(() => contract(deposit, transfer))).status, "won", `${deposit}/${transfer}`);
  }
  const first = settle(createSession(mission), mission, contract(5, 3));
  assert.equal(first.history[0].stable, true);
  assert.deepEqual(first.cash, [20, 23]);
  assert.equal(settle(first, mission, mission.reference[1]).history[1].accepted, false);
  const alternative = run(mission, mission.reference.map((plan, index) => index === 15 ? contract(7, -3) : index === 16 ? contract(7, 3) : plan));
  assert.equal(alternative.status, "won");
  assert.equal(stars(alternative, mission), 3);
  assert.equal(alternative.deposits, 164);
  const extraDeposit = run(mission, mission.reference.map((plan, index) => index === 0 ? contract(7, 4) : plan));
  assert.equal(extraDeposit.status, "won");
  assert.equal(stars(extraDeposit, mission), 2);
  const final = run(mission, mission.reference);
  assert.deepEqual(final.cash, [260, 253]);
  assert.deepEqual(final.total, [244, 240]);
});

test("old chapter sixteen continues to seventeen and every final-day checkpoint restores drafts and scores", () => {
  const old = { ...freshSave(), activeId: 16, best: { 16: 3 }, solo: { 16: 3 }, session: run(MISSIONS[15], MISSIONS[15].reference) };
  const restored = readSave("old-sixteen", { getItem: () => JSON.stringify(old) });
  assert.equal(restored.session.status, "won");
  assert.deepEqual(restored.best, { 16: 3 });
  assert.equal(MISSIONS[restored.activeId].id, 17);
  const mission = MISSIONS[23];
  let save = { ...restored, activeId: 24, session: createSession(mission), guide: { ...freshGuide(), step: 1 }, hintLevel: 1, review: false };
  save.session.hinted = true;
  for (const plan of mission.reference) {
    save.draft = plan;
    const before = readSave("before", { getItem: () => JSON.stringify(save) });
    assert.deepEqual(before, save);
    save.session = settle(before.session, mission, before.draft);
    save.review = true;
    recordScore(save);
    assert.deepEqual(readSave("after", { getItem: () => JSON.stringify(save) }), save);
    save.review = false;
  }
  assert.equal(save.best[24], 3);
  assert.equal(save.solo[24], undefined);
  assert.deepEqual(save.solo, { 16: 3 });
  const forged = { ...save, session: { ...save.session, cash: [999, 999], deposits: 0 } };
  assert.deepEqual(readSave("forged", { getItem: () => JSON.stringify(forged) }).session, save.session);
});
