import test from "node:test";
import assert from "node:assert/strict";
import { createSession, defaultPlan, settle, stars } from "../.build/src/games/game-theory/engine.js";
import { MISSIONS } from "../.build/src/games/game-theory/missions.js";
import { advanceGuide, canAdvance, formulaExplanation, freshGuide, guideLength, guideStep, readGuide, renderGuide, testGuide } from "../.build/src/games/game-theory/story.js";
import { resultFeedback } from "../.build/src/games/game-theory/results.js";
import { freshSave, readSave } from "../.build/src/games/game-theory/storage.js";

test("a new harbor player sees only the current story action and must actually compare payoffs", () => {
  const save = freshSave();
  const mission = MISSIONS[0];
  assert.equal(save.mode, "story");
  const arrival = renderGuide(save.guide, mission, save.session, "");
  assert.match(arrival, /两人的选择一起决定各赚多少/);
  assert.doesNotMatch(arrival, /data-answer|guide-deposit|guide-transfer|guide-probability|R \/|纳什均衡/);
  assert.equal(advanceGuide(save.guide, mission, save.session), true);
  assert.equal(guideStep(save.guide, mission, save.session), "compare-cooperate");
  assert.equal(advanceGuide(save.guide, mission, save.session), false);
  save.guide.answer = "cooperate";
  assert.equal(canAdvance(save.guide, mission, save.session), false);
  save.guide.answer = "rush";
  assert.match(renderGuide(save.guide, mission, save.session, ""), /最佳回应/);
  advanceGuide(save.guide, mission, save.session);
  assert.equal(save.guide.answer, null);
  assert.equal(canAdvance(save.guide, mission, save.session), false);
  save.guide.answer = "rush";
  assert.match(renderGuide(save.guide, mission, save.session, ""), /严格占优策略/);
  advanceGuide(save.guide, mission, save.session);
  assert.equal(guideStep(save.guide, mission, save.session), "dispatch");
});

test("new rules require a real experiment but never require a reference solution", () => {
  for (const id of [2, 4, 5, 6, 7]) {
    const mission = MISSIONS[id - 1];
    const session = createSession(mission);
    const guide = freshGuide();
    advanceGuide(guide, mission, session);
    assert.equal(canAdvance(guide, mission, session), false);
    const snapshot = JSON.stringify(session);
    assert.equal(testGuide(guide, mission, session), null);
    assert.equal(JSON.stringify(session), snapshot, "practice leaves the real ledger untouched");
    assert.equal(canAdvance(guide, mission, session), true, "zero deposits and refused contracts still count as observed experiments");
    assert.match(renderGuide(guide, mission, session, ""), /role="status"/);
    advanceGuide(guide, mission, session);
    assert.equal(guideStep(guide, mission, session), "dispatch");
  }
  const cash = MISSIONS[4];
  const guide = { ...freshGuide(), step: 1, deposit: 4 };
  assert.match(testGuide(guide, cash, createSession(cash)), /需要 10/);
  assert.equal(guide.tested, false);
  assert.equal(guide.deposit, 4, "invalid input is retained for correction");
  for (const id of [3, 8]) {
    const mission = MISSIONS[id - 1];
    const session = createSession(mission);
    const guide = freshGuide();
    advanceGuide(guide, mission, session);
    assert.equal(guideStep(guide, mission, session), "dispatch", "independent chapters have no prescribed tool or plan");
    for (const plan of mission.reference) Object.assign(session, settle(session, mission, plan));
    assert.equal(stars(session, mission), 3);
  }
});

test("every story checkpoint and experiment restores along with drafts and mode; old saves continue", () => {
  for (const mission of MISSIONS) {
    const save = { ...freshSave(), activeId: mission.id, session: createSession(mission), draft: { ...defaultPlan(), action: "rush" } };
    while (guideStep(save.guide, mission, save.session) !== "dispatch") {
      for (const mode of ["story", "desk"]) {
        save.mode = mode;
        const restored = readSave("save", { getItem: () => JSON.stringify(save) });
        assert.deepEqual(restored, save, `chapter ${mission.id}, step ${save.guide.step}, ${mode}`);
      }
      const step = guideStep(save.guide, mission, save.session);
      if (step.startsWith("compare")) save.guide.answer = "rush";
      else if (step !== "arrival") testGuide(save.guide, mission, save.session);
      assert.equal(advanceGuide(save.guide, mission, save.session), true);
    }
  }
  const old = freshSave();
  old.session = settle(old.session, MISSIONS[0], MISSIONS[0].reference[0]);
  old.review = true;
  old.best[1] = 3;
  delete old.mode;
  delete old.guide;
  const migrated = readSave("old", { getItem: () => JSON.stringify(old) });
  assert.equal(migrated.mode, "desk");
  assert.deepEqual(migrated.session, old.session);
  assert.deepEqual(migrated.best, { 1: 3 });
  assert.equal(migrated.guide.step, guideLength(1));
  assert.deepEqual(readGuide({ step: -8, answer: "other", deposit: NaN, transfer: 999, probability: 1, tested: true }, 2, false), freshGuide());
});

test("formulas define symbols, units, assumptions and equal-payoff boundaries before independent use", () => {
  const guide = { ...freshGuide(), step: 1, probability: 0.5 };
  const mission = MISSIONS[5];
  const session = createSession(mission);
  assert.equal(testGuide(guide, mission, session), null);
  const html = renderGuide(guide, mission, session, "");
  assert.match(html, /p 表示/);
  assert.match(html, /R 是.*T 是.*P 是/s);
  assert.match(html, /期望赚 12.*期望赚 12.*弱激励边界/s);
  assert.match(formulaExplanation(), /合作 6 \/ \(1 − 0.75\) = 24 金币/);
  assert.match(formulaExplanation(), /相互独立.*不额外折现.*后续均衡/s);
  const restored = readSave("practice", { getItem: () => JSON.stringify({ ...freshSave(), activeId: 6, session, guide }) });
  assert.deepEqual(restored.guide, guide);
});

test("settlement explains the actual decision, rejection, confiscation and goal gaps", () => {
  const participation = MISSIONS[3];
  const rejected = settle(createSession(participation), participation, { ...participation.reference[0], transfer: 0 });
  const rejection = resultFeedback(rejected, participation);
  assert.match(rejection.reply, /替代航线/);
  assert.match(rejection.learning, /保证金和手续费都未支付/);
  assert.match(rejection.failure, /距离 4 还差 2.*稳定合作 0 班/s);
  const contract = MISSIONS[1];
  const rushed = settle(createSession(contract), contract, { ...contract.reference[0], action: "rush" });
  assert.match(resultFeedback(rushed, contract).learning, /4 金币保证金被没收/);
  const repeated = MISSIONS[5];
  const longTerm = settle(createSession(repeated), repeated, repeated.reference[0]);
  assert.match(resultFeedback(longTerm, repeated).learning, /持续合作期望为 24，违约一次为 18.*不计入可用现金/s);
  const noAgreement = settle(createSession(repeated), repeated, defaultPlan());
  assert.match(resultFeedback(noAgreement, repeated).learning, /没有公开长期互惠.*整段期望收入为 10/s);
  assert.doesNotMatch(resultFeedback(noAgreement, repeated).learning, /持续合作期望为 6/);
  for (const mission of MISSIONS) {
    let session = createSession(mission);
    for (const plan of mission.reference) session = settle(session, mission, plan);
    const feedback = resultFeedback(session, mission);
    assert.equal(feedback.failure, "");
    assert.ok(feedback.reply && feedback.learning);
  }
});
