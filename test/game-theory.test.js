import test from "node:test";
import assert from "node:assert/strict";
import { analyze, contractMatrix, cooperationCount, createSession, defaultPlan, planError, settle, stars } from "../.build/src/games/game-theory/engine.js";
import { MISSIONS } from "../.build/src/games/game-theory/missions.js";
import { freshSave, readSave, recordScore, writeSave } from "../.build/src/games/game-theory/storage.js";

test("every harbor mission has an executable three-star solution and survives every save checkpoint", () => {
  for (const mission of MISSIONS) {
    let save = { ...freshSave(), activeId: mission.id, session: createSession(mission) };
    for (const plan of mission.reference) {
      assert.equal(planError(save.session, mission, plan), null, `${mission.id}: legal reference`);
      save.session = settle(save.session, mission, plan);
      recordScore(save);
      const memory = { getItem: () => JSON.stringify(save) };
      const restored = readSave("harbor", memory);
      assert.deepEqual(restored.session, save.session, `${mission.id}: replay checkpoint`);
      save = restored;
    }
    assert.equal(save.session.status, "won", `mission ${mission.id}`);
    assert.equal(stars(save.session, mission), 3);
    assert.equal(save.best[mission.id], 3);
    assert.equal(save.solo[mission.id], 3);
  }
});

test("dominance, equal-payoff boundary, confiscation and preview use the same payoff model", () => {
  const mission = MISSIONS[1];
  const base = createSession(mission);
  assert.equal(analyze(mission.rounds[0], base.cash, defaultPlan()).opponent, "rush");
  for (const deposit of [0, 3, 4]) {
    const plan = { ...mission.reference[0], deposit };
    const analysis = analyze(mission.rounds[0], base.cash, plan);
    assert.deepEqual(analysis.matrix, contractMatrix(mission.rounds[0], plan));
    assert.equal(analysis.opponent, deposit > 3 ? "cooperate" : "rush");
    assert.equal(settle(base, mission, plan).status, deposit > 3 ? "won" : "lost");
  }
  const rush = settle(base, mission, { ...mission.reference[0], action: "rush" });
  assert.deepEqual(rush.history[0].payoff, [5, 1]);
  assert.equal(rush.cash[0], 17, "deposit is lost once, not deducted twice");
  assert.equal(rush.status, "lost", "profit alone cannot bypass cooperation");
});

test("participation, own deviation incentives and cash constraints are separate", () => {
  const mission = MISSIONS[3];
  const rejected = settle(createSession(mission), mission, { ...mission.reference[0], transfer: 0 });
  assert.equal(rejected.history[0].accepted, false);
  assert.deepEqual(rejected.history[0].payoff, [2, 8]);
  assert.equal(rejected.deposits, 0);
  const unstable = settle(createSession(mission), mission, { ...mission.reference[0], deposit: 3 });
  assert.deepEqual(unstable.history[0].payoff, [4, 8]);
  assert.equal(unstable.history[0].opponent, "cooperate");
  assert.equal(cooperationCount(unstable), 0, "chosen cooperation is not necessarily stable");
  assert.equal(unstable.status, "lost");
  const poorOpponent = { ...createSession(mission), cash: [14, 4] };
  assert.match(analyze(mission.rounds[0], poorOpponent.cash, mission.reference[0]).reason, /资金不足/);
  const cashMission = MISSIONS[4];
  assert.match(planError(createSession(cashMission), cashMission, { ...cashMission.reference[0], deposit: 4 }), /需要 10/);
  const next = settle(createSession(cashMission), cashMission, cashMission.reference[0]);
  assert.deepEqual(next.cash, [13, 13], "fee consumed, collateral refunded, reserve not charged");
  const finished = settle(next, cashMission, cashMission.reference[1]);
  assert.equal(finished.total[0], 10);
});

test("long-term incentives use both parties, continuation boundary and expectations without fake cash", () => {
  const mission = MISSIONS[5];
  const plan = mission.reference[0];
  for (const [p, stable] of [[0, false], [0.25, false], [0.5, true], [0.75, true]]) {
    const analysis = analyze({ ...mission.rounds[0], continuation: p }, mission.cash, plan);
    assert.equal(analysis.stable, stable, `p=${p}`);
  }
  const record = settle(createSession(mission), mission, plan);
  assert.deepEqual(record.total, [24, 24]);
  assert.deepEqual(record.cash, mission.cash);
  const broken = settle(createSession(mission), mission, { ...plan, action: "rush" });
  assert.deepEqual(broken.total, [18, 10]);
  assert.equal(broken.status, "lost");
  const noFuture = { ...mission, rounds: [{ ...mission.rounds[0], continuation: 0.25 }] };
  assert.equal(settle(createSession(noFuture), noFuture, plan).status, "lost");
  assert.match(planError(createSession(MISSIONS[6]), MISSIONS[6], plan), /明确终点/);
});

test("a constant deposit cannot solve the capital challenge and hints preserve independent scores", () => {
  const mission = MISSIONS[7];
  for (let deposit = 0; deposit <= 12; deposit++) {
    let session = createSession(mission);
    for (const reference of mission.reference) {
      const plan = { ...reference, deposit };
      if (planError(session, mission, plan)) break;
      session = settle(session, mission, plan);
      if (session.status !== "playing") break;
    }
    assert.notEqual(session.status, "won", `constant deposit ${deposit}`);
  }
  const save = freshSave();
  save.session.hinted = true;
  save.session = settle(save.session, MISSIONS[0], MISSIONS[0].reference[0]);
  recordScore(save);
  assert.equal(save.best[1], 3);
  assert.equal(save.solo[1], undefined);
  save.session = settle(createSession(MISSIONS[0]), MISSIONS[0], MISSIONS[0].reference[0]);
  recordScore(save);
  assert.equal(save.solo[1], 3);
});

test("storage validates decisions, replays ledgers, isolates keys and fails safely", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  const save = freshSave();
  save.session = settle(save.session, MISSIONS[0], MISSIONS[0].reference[0]);
  save.review = true;
  writeSave("harbor", save, storage);
  assert.deepEqual(readSave("harbor", storage), save);
  assert.equal(readSave("other", storage).session.history.length, 0);
  const forged = { ...save, session: { ...save.session, cash: [999, 999], total: [999, 999] } };
  values.set("harbor", JSON.stringify(forged));
  assert.deepEqual(readSave("harbor", storage).session, save.session, "derive cash from decisions");
  for (const change of [
    { version: 2 }, { activeId: NaN }, { best: { 1: 9 } }, { draft: { ...defaultPlan(), deposit: -1 } },
    { session: { ...save.session, history: [{ plan: { ...defaultPlan(), action: "other" } }] } },
  ]) {
    values.set("bad", JSON.stringify({ ...save, ...change }));
    assert.deepEqual(readSave("bad", storage), freshSave());
  }
  const unavailable = { getItem() { throw new Error("Unavailable"); }, setItem() { throw new Error("Unavailable"); } };
  assert.deepEqual(readSave("save", unavailable), freshSave());
  assert.equal(writeSave("save", save, unavailable), false);
  recordScore(save);
  values.set("damaged-voyage", JSON.stringify({ ...save, session: { ...save.session, history: ["bad"] } }));
  const recovered = readSave("damaged-voyage", storage);
  assert.deepEqual(recovered.best, save.best);
  assert.deepEqual(recovered.solo, save.solo);
  assert.equal(recovered.session.history.length, 0);
  for (const action of ["cooperate", "rush"]) {
    assert.equal(analyze(MISSIONS[1].rounds[0], [12, 12], { ...MISSIONS[1].reference[0], action }).opponent, "cooperate");
  }
  assert.throws(() => settle(createSession(MISSIONS[1]), MISSIONS[1], { ...defaultPlan(), deposit: 4 }), /需要先启用合同/);
});
