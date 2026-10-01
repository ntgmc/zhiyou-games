import test from "node:test";
import assert from "node:assert/strict";
import {
  FIXED_CODES, STANDARD_CODES, entropy, averageLength, validateCodebook,
  makeHuffman, countSymbols, encodeSource, decodeSource,
  hammingEncode, hammingDecode, protectBits, unprotectBits, applyNoise,
  createSession, selectedCounts, planRound, transmitRound, waitRound,
} from "../.build/src/games/information/engine.js";
import { MISSIONS } from "../.build/src/games/information/missions.js";

function choose(session, ids, protection = "hamming") {
  session.selectedIds = ids;
  session.protection = protection;
  session.coding = "custom";
  session.customCodes = makeHuffman(selectedCounts(session, MISSIONS.find((mission) => mission.id === session.missionId))).codes;
  return session;
}

test("entropy and Huffman lengths match known distributions and round-trip messages", () => {
  const counts = { A: 8, B: 4, C: 2, D: 2 };
  assert.equal(entropy(counts), 1.75);
  assert.equal(averageLength(counts, makeHuffman(counts).codes), 1.75);
  assert.equal(entropy({ A: 1, B: 1, C: 1, D: 1 }), 2);
  assert.equal(entropy({ A: 0, B: 0, C: 0, D: 0 }), 0);
  assert.equal(entropy({ A: 100, B: 0, C: 0, D: 0 }), 0);
  for (let a = 0; a <= 4; a++) {
    for (let b = 0; b <= 4; b++) {
      const distribution = { A: a, B: b, C: 2, D: 1 };
      const codes = makeHuffman(distribution).codes;
      assert.equal(validateCodebook(codes).valid, true);
      const data = Object.entries(distribution).flatMap(([id, n]) => Array(n).fill(id));
      assert.deepEqual(decodeSource(encodeSource(data, codes), codes), { tokens: data, valid: true, remainder: "" });
      assert.ok(averageLength(distribution, codes) >= entropy(distribution) - 1e-10);
    }
  }
});

test("codebook validation rejects ambiguous, duplicate, empty and nonbinary words", () => {
  assert.equal(validateCodebook(FIXED_CODES).valid, true);
  assert.equal(validateCodebook(STANDARD_CODES).valid, true);
  for (const bad of [
    { A: "0", B: "01", C: "10", D: "11" },
    { A: "0", B: "0", C: "10", D: "11" },
    { A: "", B: "10", C: "110", D: "111" },
    { A: "x", B: "10", C: "110", D: "111" },
  ]) assert.equal(validateCodebook(bad).valid, false);
  assert.equal(decodeSource("1", STANDARD_CODES).valid, false);
});

test("all 16 Hamming words recover from each of their seven possible single-bit errors", () => {
  for (let value = 0; value < 16; value++) {
    const data = value.toString(2).padStart(4, "0");
    const word = hammingEncode(data);
    assert.equal(hammingDecode(word).syndrome, 0);
    assert.equal(hammingDecode(word).data, data);
    for (let position = 0; position < 7; position++) {
      const broken = [...word];
      broken[position] = String(1 - Number(broken[position]));
      const decoded = hammingDecode(broken.join(""));
      assert.equal(decoded.syndrome, position + 1);
      assert.equal(decoded.data, data);
      assert.equal(decoded.corrected, word);
    }
  }
});

test("double errors can cause miscorrection and padding is stripped using original length", () => {
  const word = hammingEncode("1011");
  const broken = [...word];
  broken[0] = String(1 - Number(broken[0]));
  broken[1] = String(1 - Number(broken[1]));
  assert.notEqual(hammingDecode(broken.join("")).data, "1011");
  for (let length = 1; length <= 35; length++) {
    const bits = "10101011011001".repeat(3).slice(0, length);
    for (const protection of ["none", "repeat", "hamming"]) {
      const encoded = protectBits(bits, protection);
      const restored = unprotectBits(encoded.bits, protection, length);
      assert.equal(restored.bits, bits);
      if (protection === "hamming") assert.equal(encoded.bits.length, Math.ceil(length / 4) * 7);
    }
  }
});

test("noise is repeatable and the periodic model has exactly one error per channel block", () => {
  const noise = { type: "blocks", blockSize: 7 };
  const first = applyNoise("0".repeat(50), noise, "seed");
  assert.deepEqual(first, applyNoise("0".repeat(50), noise, "seed"));
  assert.equal(first.positions.length, 8);
  first.positions.forEach((position, i) => assert.equal(Math.floor(position / 7), i));
});

test("all eight foundational missions have working three-star solutions", () => {
  for (const mission of MISSIONS.slice(0, 8)) {
    let session = createSession(mission);
    if (mission.id === 1) {
      session = transmitRound(session, mission).next;
    } else if (mission.id <= 3) {
      choose(session, [mission.packets[0].id], "none");
      session = transmitRound(session, mission).next;
    } else if (mission.id === 4) {
      session.protection = "repeat";
      session = transmitRound(session, mission).next;
    } else if (mission.id <= 6) {
      if (mission.id === 6) choose(session, [mission.packets[0].id]);
      else session.protection = "hamming";
      session = transmitRound(session, mission).next;
    } else if (mission.id === 7) {
      session.protection = "hamming";
      session = transmitRound(session, mission).next;
      session.selectedIds = ["repair", "survey"];
      session = transmitRound(session, mission).next;
    } else {
      choose(session, ["frontier"]);
      assert.equal(planRound(session, mission).totalBits, 61);
      session = transmitRound(session, mission).next;
      assert.equal(session.history[0].taskStates.frontier, "delivered");
      assert.equal(session.history[0].taskStates.dock, "pending");
      session.selectedIds = ["dock", "escort"];
      assert.equal(planRound(session, mission).syncBits, 0);
      assert.equal(planRound(session, mission).totalBits, 56);
      session = transmitRound(session, mission).next;
      choose(session, ["archive"]);
      assert.equal(planRound(session, mission).totalBits, 61);
      session = transmitRound(session, mission).next;
      assert.equal(session.totalBits, 178);
      assert.equal(session.history[0].taskStates.archive, "pending");
      assert.equal(session.history[2].taskStates.archive, "delivered");
    }
    assert.equal(session.status, "won", `mission ${mission.id}`);
    assert.equal(session.stars, 3, `mission ${mission.id} stars`);
  }
});

test("sending corrupted data, missing a deadline and over-budget plans cannot pass", () => {
  const noisyMission = MISSIONS[3];
  const wrong = transmitRound(createSession(noisyMission), noisyMission);
  assert.equal(wrong.next.status, "lost");
  assert.equal(wrong.result.packets[0].delivered, false);

  const schedulingMission = MISSIONS[6];
  assert.equal(waitRound(createSession(schedulingMission), schedulingMission).next.status, "lost");

  const compressedMission = MISSIONS[1];
  const unchanged = createSession(compressedMission);
  assert.equal(planRound(unchanged, compressedMission).valid, false);
  assert.throws(() => transmitRound(unchanged, compressedMission), /预算/);
});

test("packet padding is charged separately; selected frequencies and plans follow the queue", () => {
  const mission = MISSIONS[6];
  const session = createSession(mission);
  session.protection = "hamming";
  session.selectedIds = ["repair", "survey"];
  const plan = planRound(session, mission);
  assert.equal(plan.totalBits, 28);
  assert.equal(plan.costs[0].sourceBits, 7);
  assert.equal(plan.costs[0].padding, 1);
  assert.equal(plan.costs[1].padding, 1);
  assert.deepEqual(selectedCounts(session, mission), { A: 4, B: 2, C: 1, D: 1 });
  session.selectedIds = [];
  assert.equal(planRound(session, mission).valid, false);
  assert.deepEqual(selectedCounts(session, mission), countSymbols(mission.packets.flatMap((packet) => packet.tokens)));
});

test("optional packets affect stars without blocking graduation; old sessions are not mutated", () => {
  const mission = MISSIONS[7];
  let session = createSession(mission);
  choose(session, ["frontier"]);
  const original = structuredClone(session);
  session = transmitRound(session, mission).next;
  assert.deepEqual(original.taskStates, { frontier: "pending", dock: "pending", escort: "pending", archive: "pending" });
  assert.equal(original.history.length, 0);
  session.selectedIds = ["dock", "escort"];
  session = transmitRound(session, mission).next;
  session = waitRound(session, mission).next;
  assert.equal(session.status, "won");
  assert.equal(session.stars, 1);
  assert.equal(session.taskStates.archive, "expired");
});
