import test from "node:test";
import assert from "node:assert/strict";
import { analyze, createSession, defaultPlan, planError, settle, stars } from "../.build/src/games/game-theory/engine.js";
import { MISSIONS } from "../.build/src/games/game-theory/missions.js";
import { advanceGuide, freshGuide, guideStep, renderGuide, testGuide } from "../.build/src/games/game-theory/story.js";
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

test("the expanded campaign has complete independent tasks, open forecasts and executable three-star references", () => {
  assert.equal(MISSIONS.length, 16);
  for (const mission of MISSIONS.slice(8)) {
    assert.equal(mission.reference.length, mission.rounds.length);
    assert.equal(mission.hints.length, 3);
    assert.ok(mission.introduction && mission.rounds.every(round => round.title && round.briefing));
    const guide = freshGuide();
    const session = createSession(mission);
    advanceGuide(guide, mission, session);
    assert.equal(guideStep(guide, mission, session), mission.id === 11 ? "quota" : "dispatch");
    const finished = run(mission, mission.reference);
    assert.equal(finished.status, "won", `chapter ${mission.id}`);
    assert.equal(stars(finished, mission), 3);
    assert.equal(finished.total[0], mission.goal);
    assert.equal(resultFeedback(finished, mission).failure, "");
  }
});

test("bilateral transfers balance incentives and a locally profitable contract can strand the opponent next round", () => {
  const bilateral = MISSIONS[8];
  assert.equal(run(bilateral, bilateral.reference.map(plan => ({ ...plan, transfer: 0 }))).status, "lost");
  assert.equal(stars(run(bilateral, [contract(8), contract(8)]), bilateral), 2, "other viable plans are allowed");
  const mission = MISSIONS[9];
  const first = settle(createSession(mission), mission, contract(5));
  assert.equal(first.history[0].stable, true);
  assert.equal(first.history[0].accepted, true);
  assert.deepEqual(first.cash, [17, 14], "a locally higher profit leaves the rival poorer");
  assert.equal(planError(first, mission, mission.reference[1]), null, "own cash alone allows the request");
  const second = settle(first, mission, mission.reference[1]);
  assert.equal(second.history[1].accepted, false);
  assert.match(second.history[1].reason, /资金不足/);
  assert.deepEqual(second.history[1].payoff, mission.rounds[1].outside);
});

test("cash refunds never replenish registered collateral; rejected contracts do not spend it or fees", () => {
  const mission = MISSIONS[10];
  let session = settle(createSession(mission), mission, contract(6));
  session = settle(session, mission, contract(6));
  assert.deepEqual(session.cash, [28, 28]);
  assert.equal(session.deposits, 12);
  assert.match(planError(session, mission, contract(4)), /只剩 2/);
  assert.match(resultFeedback(session, mission).learning, /剩余额度 2/);
  assert.equal(settle(session, mission, contract(2)).status, "lost", "legal undersecured plans remain possible");
  const rejected = settle(createSession(mission), mission, contract(4, -4));
  assert.equal(rejected.history[0].accepted, false);
  assert.equal(rejected.deposits, 0);
  assert.deepEqual(rejected.cash, [20, 21]);
  const other = run(mission, [contract(5, 2), contract(4, -2), contract(4)]);
  assert.equal(other.status, "won");
  assert.equal(stars(other, mission), 2, "efficiency and necessary completion are separate");
});

test("the quota introduction requires one observed calculation without changing the real ledger", () => {
  const mission = MISSIONS[10];
  const guide = freshGuide();
  const session = createSession(mission);
  advanceGuide(guide, mission, session);
  const snapshot = JSON.stringify(session);
  assert.equal(advanceGuide(guide, mission, session), false);
  guide.deposit = NaN;
  assert.match(testGuide(guide, mission, session), /整数/);
  assert.equal(advanceGuide(guide, mission, session), false);
  assert.match(renderGuide(guide, mission, session, ""), /id="guide-deposit"[^>]*value=""/);
  guide.deposit = 4;
  assert.equal(testGuide(guide, mission, session), null);
  assert.equal(JSON.stringify(session), snapshot);
  assert.match(renderGuide(guide, mission, session, ""), /剩余额度 10.*保证金当班退还.*额度仍保持占用/s);
  advanceGuide(guide, mission, session);
  assert.equal(guideStep(guide, mission, session), "dispatch");
});

test("independent repeated relationships require different decisions, never credit expectations as cash", () => {
  const mission = MISSIONS[11];
  const alwaysReciprocate = mission.rounds.map(() => ({ ...defaultPlan(), reciprocal: true }));
  assert.equal(run(mission, alwaysReciprocate).status, "lost");
  const finished = run(mission, mission.reference);
  assert.deepEqual(finished.total, [40, 40]);
  assert.deepEqual(finished.cash, mission.cash);
  assert.deepEqual(finished.history.map(item => item.payoff[0]), [4, 12, 24]);
});

test("short-sighted optimization and every constant contract fail the full-day voyage", () => {
  const mission = MISSIONS[15];
  for (const mode of ["minimum-deposit", "maximum-profit"]) {
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
      if (!choices.length) break;
      session = settle(session, mission, choices[0].plan);
    }
    assert.notEqual(session.status, "won", mode);
    assert.ok(session.step < mission.rounds.length, "the failure is a real downstream constraint");
  }
  for (let deposit = 0; deposit <= 12; deposit++) for (let transfer = -4; transfer <= 4; transfer++) {
    assert.notEqual(run(mission, mission.rounds.map(() => contract(deposit, transfer))).status, "won", `${deposit}/${transfer}`);
  }
  let session = createSession(mission);
  for (let index = 0; index < 6; index++) session = settle(session, mission, index === 5 ? contract(5, 3) : mission.reference[index]);
  assert.equal(session.history[5].stable, true, "saving collateral this round still creates stable local cooperation");
  assert.equal(session.cash[1], 53);
  assert.equal(settle(session, mission, mission.reference[6]).history[6].accepted, false, "next rival needs 54");
  const alternative = run(mission, mission.reference.map((plan, index) => index === 0 ? { ...plan, deposit: 5 } : plan));
  assert.equal(alternative.status, "won");
  assert.equal(stars(alternative, mission), 2);
});

test("long-voyage checkpoints rebuild budgets, preserve old scores and isolate hinted results", () => {
  const mission = MISSIONS[15];
  let save = { ...freshSave(), activeId: mission.id, best: { 8: 3 }, solo: { 8: 3 }, session: createSession(mission) };
  save.session.hinted = true;
  save.hintLevel = 1;
  for (const plan of mission.reference) {
    save.session = settle(save.session, mission, plan);
    save.review = true;
    recordScore(save);
    const restored = readSave("challenge", { getItem: () => JSON.stringify(save) });
    assert.deepEqual(restored, save);
    save = restored;
  }
  assert.equal(save.best[16], 3);
  assert.equal(save.solo[16], undefined);
  assert.deepEqual(save.solo, { 8: 3 });
  const forged = { ...save, session: { ...save.session, deposits: 0, cash: [999, 999] } };
  assert.deepEqual(readSave("forged", { getItem: () => JSON.stringify(forged) }).session, save.session);
  const old = { ...freshSave(), activeId: 8, best: { 8: 3 }, session: run(MISSIONS[7], MISSIONS[7].reference) };
  const loaded = readSave("old-eight", { getItem: () => JSON.stringify(old) });
  assert.equal(loaded.session.status, "won");
  assert.equal(loaded.best[8], 3);
  assert.equal(MISSIONS[loaded.activeId].id, 9, "the former ending now continues into the new campaign");
});
