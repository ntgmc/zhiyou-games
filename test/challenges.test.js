import test from "node:test";
import assert from "node:assert/strict";
import { MISSIONS } from "../.build/src/games/information/missions.js";
import {
  FIXED_CODES, STANDARD_CODES, createSession, countSymbols, makeHuffman,
  planRound, transmitRound, waitRound, roundConditions, selectedCounts, validateCodebook,
} from "../.build/src/games/information/engine.js";

const get = (id) => MISSIONS.find((item) => item.id === id);
function configure(session, mission, ids, protection, codes = session.customCodes) {
  session.selectedIds = ids;
  session.protection = protection;
  session.coding = "custom";
  session.customCodes = { ...codes };
  return planRound(session, mission);
}
const optimalCodes = (mission, ids) => makeHuffman(countSymbols(mission.packets.filter(({ id }) => ids.includes(id)).flatMap(({ tokens }) => tokens))).codes;
const bridgeCodes = { A: "0", B: "110", C: "111", D: "10" };

test("every new challenge has a full three-star solution using the actual transmission pipeline", () => {
  const solutions = {
    9: [[["micro-stop", "micro-route"], "hamming", FIXED_CODES]],
    10: [[["window-urgent"], "hamming", STANDARD_CODES], [["window-heavy"], "none", STANDARD_CODES], [["window-tail"], "hamming", STANDARD_CODES]],
    11: [[["commit-stop"], "hamming", STANDARD_CODES], [["commit-route"], "hamming", STANDARD_CODES]],
    12: [[["final-urgent"], "hamming", STANDARD_CODES], [["final-repair", "final-array"], "none", STANDARD_CODES],
      [["final-brake"], "hamming", optimalCodes(get(12), ["final-brake"])], [["final-home", "final-memory"], "none", STANDARD_CODES]],
    13: [[["return-stop-a", "return-stop-b"], "repeat", get(13).initialCodes], [["return-route"], "hamming", STANDARD_CODES],
      [["return-go-a", "return-go-b"], "repeat", STANDARD_CODES], [["return-brake"], "hamming", optimalCodes(get(13), ["return-brake"])]],
    14: [[["twins-out"], "hamming", bridgeCodes], [["twins-handoff"], "hamming", bridgeCodes], [["twins-in"], "hamming", bridgeCodes]],
    15: [[["seven-stop", "seven-check"], "hamming", get(15).initialCodes], [["seven-route"], "hamming", STANDARD_CODES],
      [["seven-east", "seven-west"], "hamming", STANDARD_CODES], [["seven-close", "seven-park"], "hamming", FIXED_CODES]],
    16: [[["queue-urgent"], "hamming", STANDARD_CODES], [["queue-repair", "queue-array"], "none", STANDARD_CODES],
      [["queue-brake"], "hamming", optimalCodes(get(16), ["queue-brake"])],
      [["queue-long", "queue-tail", "queue-dock"], "none", STANDARD_CODES], [["queue-home"], "hamming", STANDARD_CODES]],
    17: [[["ahead-out"], "none", bridgeCodes], [["ahead-stop-a", "ahead-stop-b"], "repeat", bridgeCodes],
      [["ahead-cross"], "hamming", bridgeCodes], [["ahead-home", "ahead-beacon"], "none", bridgeCodes]],
    18: [[["home-out"], "none", bridgeCodes], [["home-stop-a", "home-stop-b"], "repeat", bridgeCodes],
      [["home-brake"], "hamming", bridgeCodes], [["home-go-a", "home-go-b"], "repeat", bridgeCodes],
      [["home-array", "home-repair"], "none", FIXED_CODES], [["home-close", "home-ella"], "hamming", FIXED_CODES]],
  };
  const totals = { 9: 21, 10: 70, 11: 119, 12: 164, 13: 134, 14: 145, 15: 213, 16: 220, 17: 154, 18: 195 };
  for (const [id, turns] of Object.entries(solutions)) {
    const mission = get(Number(id));
    let session = createSession(mission);
    for (const [ids, protection, codes] of turns) {
      assert.equal(configure(session, mission, ids, protection, codes).valid, true, `mission ${id} round ${session.round}`);
      session = transmitRound(session, mission).next;
    }
    assert.equal(session.status, "won", `mission ${id}`);
    assert.equal(session.stars, 3, `mission ${id}`);
    assert.equal(session.totalBits, totals[id]);
    assert.ok(session.history.every(({ packets }) => packets.every(({ delivered }) => delivered)));
  }
});

test("Huffman source savings can increase independently padded transmission cost", () => {
  const mission = get(9);
  const session = createSession(mission);
  const ids = mission.packets.map(({ id }) => id);
  const huffman = configure(session, mission, ids, "hamming", optimalCodes(mission, ids));
  const fixed = configure(session, mission, ids, "hamming", FIXED_CODES);
  assert.equal(huffman.costs.reduce((s, p) => s + p.sourceBits, 0), 11);
  assert.equal(fixed.costs.reduce((s, p) => s + p.sourceBits, 0), 12);
  assert.equal(huffman.totalBits, 28);
  assert.equal(huffman.valid, false);
  assert.equal(fixed.totalBits, 21);
  assert.equal(fixed.valid, true);
});

test("window forecasts affect real noise, capacity, deadline failures and historical snapshots", () => {
  const mission = get(10);
  let session = createSession(mission);
  configure(session, mission, ["window-urgent"], "hamming", STANDARD_CODES);
  session = transmitRound(session, mission).next;
  assert.equal(roundConditions(mission, session.round).noise.type, "none");
  configure(session, mission, ["window-heavy"], "hamming", STANDARD_CODES);
  assert.equal(planRound(session, mission).valid, false, "always choosing Hamming does not solve this challenge");
  configure(session, mission, ["window-tail"], "none", STANDARD_CODES);
  session = transmitRound(session, mission).next;
  assert.equal(session.history[1].packets[0].flipPositions.length, 0);
  assert.equal(session.history[1].noise.type, "none");
  assert.equal(session.history[1].budget, 32);
  configure(session, mission, ["window-heavy"], "hamming", STANDARD_CODES);
  assert.equal(planRound(session, mission).valid, false, "earliest-deadline-only scheduling missed the sole large-packet window");
  assert.equal(waitRound(session, mission).next.status, "lost");
  assert.equal(session.history[1].noise.type, "none", "moving rounds does not change saved channel conditions");
});

test("a cheaper first transmission can make the following mandatory packet infeasible", () => {
  const mission = get(11);
  let session = createSession(mission);
  const plan = configure(session, mission, ["commit-stop"], "hamming", optimalCodes(mission, ["commit-stop"]));
  assert.equal(plan.totalBits, 19);
  assert.equal(plan.valid, true);
  session = transmitRound(session, mission).next;
  configure(session, mission, ["commit-route"], "hamming", STANDARD_CODES);
  assert.equal(planRound(session, mission).totalBits, 110);
  assert.equal(planRound(session, mission).syncBits, 12);
  assert.equal(planRound(session, mission).valid, false);
  assert.equal(waitRound(session, mission).next.status, "lost");
});

test("future packets are visible for planning but cannot be sent early or influence available frequencies", () => {
  const mission = get(11);
  const session = createSession(mission);
  assert.deepEqual(selectedCounts(session, mission), { A: 0, B: 0, C: 0, D: 4 });
  configure(session, mission, ["commit-route"], "hamming", STANDARD_CODES);
  assert.match(planRound(session, mission).reason, /尚未抵达/);
  assert.throws(() => transmitRound(session, mission), /尚未抵达/);
  assert.equal(session.totalBits, 0);
});

test("the final challenge permits early delivery but charges its global cost and prevents budget bypasses", () => {
  const mission = get(12);
  let session = createSession(mission);
  configure(session, mission, ["final-urgent", "final-repair"], "hamming", STANDARD_CODES);
  session = transmitRound(session, mission).next;
  configure(session, mission, ["final-array"], "none", STANDARD_CODES);
  session = transmitRound(session, mission).next;
  configure(session, mission, ["final-brake"], "hamming", optimalCodes(mission, ["final-brake"]));
  session = transmitRound(session, mission).next;
  const plan = configure(session, mission, ["final-home", "final-memory"], "none", STANDARD_CODES);
  assert.equal(plan.totalBits, 40);
  assert.equal(plan.remainingBits, 2, "the final window itself has room");
  assert.match(plan.reason, /整次值班总预算/);
  assert.throws(() => transmitRound(session, mission), /总预算/);
  assert.equal(plan.totalRemaining, 33);
});

test("a low-star final completion remains possible when the optional archive is deliberately left behind", () => {
  const mission = get(12);
  let session = createSession(mission);
  const turns = [
    [["final-urgent"], "hamming", STANDARD_CODES],
    [["final-repair", "final-array"], "none", STANDARD_CODES],
    [["final-brake"], "hamming", optimalCodes(mission, ["final-brake"])],
    [["final-home"], "none", optimalCodes(mission, ["final-brake"])],
  ];
  for (const [ids, protection, codes] of turns) {
    configure(session, mission, ids, protection, codes);
    session = transmitRound(session, mission).next;
  }
  assert.equal(session.status, "won");
  assert.equal(session.stars, 1);
  assert.equal(session.taskStates["final-memory"], "expired");
  assert.equal(session.totalBits, 145);
});

test("the return line needs repetition for tiny pulses and a codebook chosen for the next acknowledgements", () => {
  const mission = get(13);
  let session = createSession(mission);
  const stops = ["return-stop-a", "return-stop-b"];
  assert.equal(configure(session, mission, stops, "hamming").totalBits, 14);
  assert.equal(planRound(session, mission).valid, false);
  assert.equal(configure(session, mission, stops, "none").valid, true);
  assert.equal(transmitRound(session, mission).next.status, "lost", "fitting the window does not guarantee delivery");
  configure(session, mission, stops, "repeat");
  session = transmitRound(session, mission).next;
  assert.equal(configure(session, mission, ["return-brake"], "hamming").valid, true);
  session = transmitRound(session, mission).next;
  for (const protection of ["repeat", "hamming"]) {
    assert.equal(configure(session, mission, ["return-go-a", "return-go-b"], protection).valid, false);
  }
  assert.equal(configure(session, mission, ["return-go-a", "return-go-b"], "repeat", STANDARD_CODES).valid, false);
  assert.equal(waitRound(session, mission).next.status, "lost", "the wrong large packet left an unusable codebook");
});

test("both shared-codebook missions reject current-only optimization after a legal first send", () => {
  for (const [id, first, second] of [
    [14, "twins-out", "twins-handoff"], [17, "ahead-out", "ahead-stop-a"],
  ]) {
    const mission = get(id);
    let session = createSession(mission);
    assert.equal(configure(session, mission, [first], id === 14 ? "hamming" : "none", optimalCodes(mission, [first])).valid, true);
    session = transmitRound(session, mission).next;
    if (id === 14) {
      configure(session, mission, [second], "hamming");
      session = transmitRound(session, mission).next;
      assert.equal(configure(session, mission, ["twins-in"], "hamming").valid, false);
      assert.equal(configure(session, mission, ["twins-in"], "hamming", optimalCodes(mission, ["twins-in"])).totalBits, 68);
      assert.equal(planRound(session, mission).valid, false);
    } else {
      for (const protection of ["repeat", "hamming"]) {
        assert.equal(configure(session, mission, [second, "ahead-stop-b"], protection).valid, false);
      }
      assert.equal(configure(session, mission, [second, "ahead-stop-b"], "repeat", bridgeCodes).valid, false);
    }
    assert.equal(waitRound(session, mission).next.status, "lost");
  }
});

test("seven independent packets need exact initial words, retained mid-shift words and a final fixed codebook", () => {
  const mission = get(15);
  let session = createSession(mission);
  const first = ["seven-stop", "seven-check"];
  const replaced = configure(session, mission, first, "hamming", FIXED_CODES);
  assert.equal(replaced.payloadBits, 21);
  assert.equal(replaced.syncBits, 12);
  assert.equal(replaced.valid, false);
  configure(session, mission, first, "hamming", mission.initialCodes);
  session = transmitRound(session, mission).next;
  configure(session, mission, ["seven-route"], "hamming", STANDARD_CODES);
  session = transmitRound(session, mission).next;
  const middle = ["seven-east", "seven-west"];
  const optimized = configure(session, mission, middle, "hamming", optimalCodes(mission, middle));
  assert.equal(optimized.payloadBits, 49);
  assert.equal(optimized.syncBits, 12);
  assert.equal(optimized.valid, false);
  configure(session, mission, middle, "hamming", STANDARD_CODES);
  session = transmitRound(session, mission).next;
  assert.equal(configure(session, mission, ["seven-close", "seven-park"], "hamming").totalBits, 35);
  assert.equal(planRound(session, mission).valid, false);
  assert.equal(configure(session, mission, ["seven-close", "seven-park"], "hamming", FIXED_CODES).totalBits, 33);
  assert.equal(transmitRound(session, mission).next.stars, 3);
});

test("legal early short-packet delivery exhausts the final budget in the five-round queue", () => {
  const mission = get(16);
  let session = createSession(mission);
  assert.equal(configure(session, mission, ["queue-urgent", "queue-repair"], "hamming", STANDARD_CODES).valid, true);
  session = transmitRound(session, mission).next;
  const turns = [
    [["queue-array"], "none", STANDARD_CODES],
    [["queue-brake"], "hamming", optimalCodes(mission, ["queue-brake"])],
    [["queue-long", "queue-tail", "queue-dock"], "none", STANDARD_CODES],
  ];
  for (const [ids, protection, codes] of turns) {
    assert.equal(configure(session, mission, ids, protection, codes).valid, true);
    session = transmitRound(session, mission).next;
  }
  const final = configure(session, mission, ["queue-home"], "hamming", STANDARD_CODES);
  assert.equal(final.totalBits, final.budget, "the final packet fits its own window exactly");
  assert.equal(final.valid, false);
  assert.match(final.reason, /总预算 7 bit/);
  assert.throws(() => transmitRound(session, mission), /总预算/);
  assert.equal(waitRound(session, mission).next.status, "lost");
});

test("the final shift punishes legal local choices at both protocol handoffs", () => {
  const mission = get(18);
  let session = createSession(mission);
  configure(session, mission, ["home-out"], "none", bridgeCodes);
  session = transmitRound(session, mission).next;
  configure(session, mission, ["home-stop-a", "home-stop-b"], "repeat", bridgeCodes);
  session = transmitRound(session, mission).next;
  assert.equal(configure(session, mission, ["home-brake"], "hamming", optimalCodes(mission, ["home-brake"])).valid, true);
  const greedy = transmitRound(session, mission).next;
  for (const protection of ["repeat", "hamming"]) {
    assert.equal(configure(greedy, mission, ["home-go-a", "home-go-b"], protection).valid, false);
  }
  assert.equal(waitRound(greedy, mission).next.status, "lost");

  configure(session, mission, ["home-brake"], "hamming", bridgeCodes);
  session = transmitRound(session, mission).next;
  configure(session, mission, ["home-go-a", "home-go-b"], "repeat", bridgeCodes);
  session = transmitRound(session, mission).next;
  assert.equal(configure(session, mission, ["home-array", "home-repair"], "none", bridgeCodes).valid, true);
  session = transmitRound(session, mission).next;
  const finalIds = ["home-close", "home-ella"];
  assert.equal(configure(session, mission, finalIds, "hamming", bridgeCodes).totalBits, 28);
  assert.equal(planRound(session, mission).valid, false);
  assert.equal(configure(session, mission, finalIds, "hamming", FIXED_CODES).totalBits, 33);
  assert.equal(planRound(session, mission).valid, false, "the fixed codebook needed to be synchronized in the preceding window");
  assert.equal(waitRound(session, mission).next.status, "lost");
});

test("the return campaign has mandatory stakes and a forecast for every round", () => {
  assert.deepEqual(MISSIONS.map(({ id }) => id), Array.from({ length: 24 }, (_, i) => i + 1));
  for (const mission of MISSIONS.filter(({ id }) => id >= 13 && id <= 18)) {
    assert.equal(mission.independent, true);
    assert.equal(mission.hints.length, 3);
    assert.equal(mission.windows.length, mission.rounds);
    assert.equal(mission.totalBudget, mission.parBits);
    assert.ok(mission.packets.every(({ required }) => required === true));
  }
  assert.equal(get(18).packets.length, 10);
});

test("challenge definitions have coherent windows and release/deadline intervals", () => {
  for (const mission of MISSIONS) {
    if (mission.windows) assert.equal(mission.windows.length, mission.rounds);
    for (const packet of mission.packets) {
      assert.ok((packet.releaseRound || 1) <= packet.deadline);
      assert.ok(packet.deadline <= mission.rounds);
    }
    assert.equal(validateCodebook(mission.initialCodes || FIXED_CODES).valid, true);
  }
});
