import test from "node:test";
import assert from "node:assert/strict";
import {
  FIXED_CODES, createSession, countSymbols, makeHuffman, packetAvailable,
  planRound, roundConditions, transmitRound, waitRound,
} from "../.build/src/games/information/engine.js";
import { MISSIONS } from "../.build/src/games/information/missions.js";
import { readSave, writeSave } from "../.build/src/games/information/storage.js";
import { prepareStory, STORY } from "../.build/src/games/information/story.js";
import { storyResult, detailedResult } from "../.build/src/games/information/results.js";

const get = (id) => MISSIONS.find((mission) => mission.id === id);
const book = (short, middle, third, fourth) => ({ [short]: "0", [middle]: "10", [third]: "110", [fourth]: "111" });
const turns = {
  19: [
    [["urgent", "relay", "repair"], "none"], [[], "none"],
    [["left-route", "dock-a"], "none", book("B", "D", "A", "C")],
    [["left-a", "left-b"], "repeat"], [["brake", "dock-b"], "hamming", FIXED_CODES],
    [["tow", "scan", "close"], "none"],
  ],
  20: [
    [["handoff", "relay"], "none"], [["stop-a", "stop-b"], "hamming"],
    [["brake"], "hamming", book("D", "A", "B", "C")],
    [["repair", "dock-a", "dock-b", "spare"], "none", book("B", "A", "C", "D")],
    [["left-a", "left-b"], "repeat"], [[], "none"], [["left-route", "scan", "tow"], "none"],
  ],
  21: [
    [["handoff", "relay"], "none"], [["stop-a", "stop-b"], "hamming"],
    [["repair", "left-route"], "hamming", book("A", "D", "B", "C")],
    [["scan", "spare", "medical"], "none"], [["left-a", "left-b"], "repeat"],
    [["brake"], "hamming", book("C", "D", "A", "B")],
    [["dock-a", "dock-b", "survey", "calibration"], "none", book("B", "A", "C", "D")],
    [["tow"], "hamming"],
  ],
  22: [
    [["handoff", "relay"], "none"], [["stop-a", "stop-b"], "hamming"],
    [["repair", "left-route"], "hamming", book("D", "C", "A", "B")],
    [["scan", "spare", "medical"], "none"], [["left-a", "left-b"], "repeat"],
    [["brake", "dock-b"], "hamming", book("B", "C", "A", "D")],
    [["dock-a", "tow", "calibration", "tug"], "none", book("A", "D", "B", "C")],
    [[], "none"], [["right-a", "right-b"], "repeat"],
    [["survey", "right-route", "beacon", "memory"], "none"],
  ],
  23: [
    [["handoff", "relay"], "none"], [["stop-a", "stop-b"], "hamming"],
    [["repair", "left-route"], "hamming", book("C", "B", "A", "D")],
    [["scan", "spare", "medical"], "none"], [["left-a", "left-b"], "repeat"],
    [["brake", "dock-b"], "hamming", book("A", "B", "C", "D")],
    [["dock-a", "tow", "calibration", "tug"], "none", book("D", "C", "A", "B")],
    [[], "none"], [["right-a", "right-b"], "repeat"],
    [["survey", "right-route", "beacon"], "none"],
    [["fleet"], "hamming", FIXED_CODES], [["return", "escort", "memory"], "none"],
  ],
  24: [
    [["handoff", "relay"], "none"], [["stop-a", "stop-b"], "hamming"],
    [["scan", "spare"], "hamming", book("B", "A", "C", "D")],
    [["repair", "left-route", "medical"], "none"], [["left-a", "left-b"], "repeat"],
    [["brake", "dock-b"], "hamming", book("D", "A", "B", "C")],
    [["dock-a", "tow", "calibration", "tug"], "none", book("C", "A", "B", "D")],
    [[], "none"], [["right-a", "right-b"], "repeat"],
    [["survey", "right-route", "beacon"], "none"],
    [["fleet"], "hamming", FIXED_CODES], [["return", "escort", "close"], "none"],
    [["go-a", "go-b"], "repeat"], [["ella", "memory"], "hamming"],
  ],
};
const costs = {
  19: [46, 0, 48, 6, 75, 52], 20: [54, 14, 68, 48, 6, 0, 64],
  21: [54, 14, 75, 47, 6, 68, 63, 21],
  22: [54, 14, 75, 47, 6, 75, 60, 0, 6, 83],
  23: [54, 14, 75, 47, 6, 75, 60, 0, 6, 68, 47, 76],
  24: [56, 14, 68, 50, 6, 75, 61, 0, 6, 72, 47, 68, 12, 35],
};

function configure(session, mission, [suffixes, protection, codes = session.receiverCodes]) {
  session.selectedIds = suffixes.map((suffix) => `shift-${mission.id}-${suffix}`);
  session.protection = protection;
  session.coding = "custom";
  session.customCodes = { ...codes };
  return planRound(session, mission);
}

function send(session, mission, turn) {
  if (!turn[0].length) return waitRound(session, mission).next;
  const plan = configure(session, mission, turn);
  assert.equal(plan.valid, true, `mission ${mission.id}, round ${session.round}: ${plan.reason}`);
  return transmitRound(session, mission).next;
}

for (const id of [19, 20, 21, 22, 23, 24]) {
  test(`shift ${id} completes every request with three stars through real encoding, noise and decoding`, () => {
    const mission = get(id);
    let session = createSession(mission);
    for (const turn of turns[id]) session = send(session, mission, turn);
    assert.equal(session.status, "won");
    assert.equal(session.stars, 3);
    assert.equal(session.totalBits, mission.parBits);
    assert.deepEqual(session.history.map(({ totalBits }) => totalBits), costs[id]);
    assert.ok(Object.values(session.taskStates).every((state) => state === "delivered"));
    assert.equal(session.history.flatMap(({ packets }) => packets).length, mission.packets.length);
    assert.ok(session.history.every(({ packets }) => packets.every(({ delivered }) => delivered)));
  });
}

test("the comprehensive campaign increases scale and tightens slack without adding new mechanics", () => {
  const shifts = MISSIONS.filter(({ id }) => id >= 19);
  assert.deepEqual(shifts.map(({ packets }) => packets.length), [12, 14, 17, 23, 26, 30]);
  assert.deepEqual(shifts.map(({ rounds }) => rounds), [6, 7, 8, 10, 12, 14]);
  assert.deepEqual(shifts.map(({ totalBudget, parBits }) => totalBudget - parBits), [12, 8, 6, 4, 2, 0]);
  for (const mission of shifts) {
    assert.ok(mission.independent);
    assert.equal(mission.hints.length, 3);
    assert.equal(mission.syncCost, 12);
    assert.ok(mission.packets.every(({ required }) => required));
    assert.deepEqual(mission.protections, get(18).protections);
    assert.ok(mission.windows.every(({ noise }) => ["none", "single", "blocks"].includes(noise.type)));
    assert.ok(mission.packets.some(({ releaseRound, deadline }) => deadline - releaseRound >= 4));
  }
  assert.deepEqual(get(24).windows.flatMap(({ noise }, i) => noise.type === "none" ? [i + 1] : []), [1, 4, 7, 10, 12]);
});

test("always using Hamming and optimizing each reference batch with Huffman both fail the final shift", () => {
  const mission = get(24);
  const alwaysProtected = createSession(mission);
  assert.equal(configure(alwaysProtected, mission, [turns[24][0][0], "hamming"]).valid, false);

  let greedyCodes = createSession(mission);
  let blockedRound = null;
  for (const [suffixes, protection] of turns[24]) {
    if (!suffixes.length) {
      greedyCodes = waitRound(greedyCodes, mission).next;
      continue;
    }
    const ids = suffixes.map((suffix) => `shift-24-${suffix}`);
    const codes = makeHuffman(countSymbols(mission.packets.filter(({ id }) => ids.includes(id)).flatMap(({ tokens }) => tokens))).codes;
    if (!configure(greedyCodes, mission, [suffixes, protection, codes]).valid) {
      blockedRound = greedyCodes.round;
      break;
    }
    greedyCodes = transmitRound(greedyCodes, mission).next;
  }
  assert.equal(blockedRound, 1, "equally short Huffman words still charge synchronization and overflow the first window");
});

test("an earliest-deadline queue with current-only Huffman cannot solve the final shift", () => {
  const mission = get(24);
  let session = createSession(mission);
  while (session.status === "playing") {
    const available = mission.packets.filter((packet) => session.taskStates[packet.id] === "pending" && packetAvailable(packet, session.round));
    available.sort((a, b) => a.deadline - b.deadline);
    const noise = roundConditions(mission, session.round).noise.type;
    const protections = noise === "none" ? ["none"] : noise === "single" ? ["repeat", "hamming"] : ["hamming"];
    let best = null;
    for (let length = 1; length <= available.length; length++) {
      const packets = available.slice(0, length);
      const codes = makeHuffman(countSymbols(packets.flatMap(({ tokens }) => tokens))).codes;
      for (const protection of protections) {
        session.selectedIds = packets.map(({ id }) => id);
        session.coding = "custom";
        session.customCodes = codes;
        session.protection = protection;
        const plan = planRound(session, mission);
        if (plan.valid && (!best || length > best.length || length === best.length && plan.totalBits < best.cost)) {
          best = { length, cost: plan.totalBits, session: structuredClone(session) };
        }
      }
    }
    session = best ? transmitRound(best.session, mission).next : waitRound(session, mission).next;
  }
  assert.equal(session.status, "lost");
  assert.ok(Object.values(session.taskStates).some((state) => state === "expired" || state === "failed"));
});

test("retaining the cheaper-looking protocol leaves the final return batch outside every codebook budget", () => {
  const mission = get(24);
  let session = createSession(mission);
  for (const turn of turns[24].slice(0, 10)) session = send(session, mission, turn);
  const retained = configure(session, mission, [turns[24][10][0], "hamming"]);
  assert.equal(retained.syncBits, 0);
  assert.equal(retained.totalBits, 49);
  assert.equal(retained.valid, true);
  session = transmitRound(session, mission).next;
  const symbols = ["A", "B", "C", "D"];
  const alternatives = [FIXED_CODES, session.receiverCodes];
  for (const short of symbols) for (const middle of symbols.filter((id) => id !== short)) {
    alternatives.push(book(short, middle, ...symbols.filter((id) => id !== short && id !== middle)));
  }
  for (const codes of alternatives) {
    const nextPlan = configure(session, mission, [turns[24][11][0], "none", codes]);
    assert.equal(nextPlan.valid, false);
    assert.ok(nextPlan.totalBits > nextPlan.budget, "switching in the return window is already too late");
  }
});

test("a legal early closing acknowledgement fits every local window but exceeds the final global budget", () => {
  const mission = get(24);
  let session = createSession(mission);
  for (const turn of turns[24].slice(0, 10)) session = send(session, mission, turn);
  session = send(session, mission, [["fleet", "close"], "hamming", FIXED_CODES]);
  assert.equal(session.history.at(-1).totalBits, 54);
  session = send(session, mission, [["return", "escort"], "none"]);
  session = send(session, mission, turns[24][12]);
  const final = configure(session, mission, turns[24][13]);
  assert.equal(final.totalBits, 35);
  assert.equal(final.budget, 49);
  assert.equal(final.totalRemaining, 32);
  assert.equal(final.valid, false);
  assert.match(final.reason, /总预算 3 bit/);
  assert.throws(() => transmitRound(session, mission), /总预算/);
  assert.equal(waitRound(session, mission).next.status, "lost");
});

test("old final completions unlock the new campaign, and a saved final shift resumes at its exact protocol", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  values.set("legacy", JSON.stringify({ version: 1, activeId: 18, progress: { unlocked: 18, best: { 18: 3 }, soloBest: { 18: 3 }, lessons: [] }, session: createSession(get(18)) }));
  const legacy = readSave("legacy", storage);
  assert.equal(legacy.progress.unlocked, 19);
  assert.deepEqual(legacy.progress.soloBest, { 18: 3 });

  const mission = get(24);
  let session = prepareStory(createSession(mission), mission);
  session.guide.intro = STORY[24].scenes.length;
  for (const turn of turns[24].slice(0, 8)) session = send(session, mission, turn);
  writeSave("final", { version: 1, activeId: 24, progress: { unlocked: 24, best: {}, soloBest: {}, lessons: [] }, session }, storage);
  const loaded = readSave("final", storage);
  assert.deepEqual(loaded.session, session);
  session = prepareStory(loaded.session, mission);
  assert.equal(session.round, 9);
  assert.equal(session.history[7].skipped, true);
  for (const turn of turns[24].slice(8)) session = send(session, mission, turn);
  assert.equal(session.status, "won");
  assert.equal(session.stars, 3);
  assert.equal(session.totalBits, 570);
  assert.match(storyResult(session, mission, session.history.at(-1)), /30 份请求全部交付/);
  assert.match(detailedResult(session, mission, session.history.at(-1)), /最后一班结束，可以交班了/);
});
