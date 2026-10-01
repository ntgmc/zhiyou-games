import test from "node:test";
import assert from "node:assert/strict";
import { createSession, makeHuffman, selectedCounts, transmitRound } from "../.build/src/games/information/engine.js";
import { MISSIONS } from "../.build/src/games/information/missions.js";
import { STORY, prepareStory, storyStep, advanceStory, storyCanSend } from "../.build/src/games/information/story.js";

test("the first lesson introduces one action at a time and prevents sending early", () => {
  const mission = MISSIONS[0];
  const session = createSession(mission);
  prepareStory(session, mission);
  assert.deepEqual(session.selectedIds, []);
  assert.equal(storyCanSend(session, mission), false);
  session.guide.intro = STORY[mission.id].scenes.length;
  assert.equal(storyStep(session, mission).action, "packet");
  assert.equal(advanceStory(session, mission, "next"), false);
  session.selectedIds = [mission.packets[0].id];
  assert.equal(advanceStory(session, mission, "packet"), true);
  assert.equal(storyStep(session, mission).action, "demo");
  assert.equal(advanceStory(session, mission, "next"), false);
  session.guide.demo = "B";
  assert.equal(advanceStory(session, mission, "next"), true);
  assert.equal(storyCanSend(session, mission), true);
  const next = transmitRound(session, mission).next;
  assert.equal(next.status, "won");
  assert.equal(next.guide.phase, 2);
  assert.equal(storyCanSend(next, mission), false);
});

test("reloading keeps a tutorial step while migrated games resume without replaying completed actions", () => {
  const mission = MISSIONS[0];
  const session = createSession(mission);
  prepareStory(session, mission);
  session.guide.intro = 2;
  session.guide.demo = "A";
  const copy = structuredClone(session);
  prepareStory(copy, mission);
  assert.deepEqual(copy, session);
  session.selectedIds = [mission.packets[0].id];
  const completed = transmitRound(session, mission).next;
  delete completed.guide;
  prepareStory(completed, mission);
  assert.equal(completed.guide.skipped, true);
  assert.equal(completed.taskStates[mission.packets[0].id], "delivered");
});

test("compression, majority vote and correction lessons require the actual learning action", () => {
  const compressionMission = MISSIONS[1];
  const compression = createSession(compressionMission);
  prepareStory(compression, compressionMission);
  compression.guide.intro = STORY[2].scenes.length;
  assert.equal(advanceStory(compression, compressionMission, "next"), true);
  assert.equal(advanceStory(compression, compressionMission, "next"), false);
  compression.customCodes = makeHuffman(selectedCounts(compression, compressionMission)).codes;
  compression.coding = "custom";
  assert.equal(advanceStory(compression, compressionMission, "tree-apply"), true);
  assert.equal(storyCanSend(compression, compressionMission), true);

  const repeatMission = MISSIONS[3];
  const repeat = createSession(repeatMission);
  prepareStory(repeat, repeatMission);
  repeat.guide.intro = STORY[4].scenes.length;
  repeat.guide.quiz = "1";
  assert.equal(advanceStory(repeat, repeatMission, "next"), false);
  repeat.guide.quiz = "0";
  assert.equal(advanceStory(repeat, repeatMission, "next"), true);
  assert.equal(advanceStory(repeat, repeatMission, "protection"), false);
  repeat.protection = "repeat";
  assert.equal(advanceStory(repeat, repeatMission, "protection"), true);
  assert.equal(storyCanSend(repeat, repeatMission), true);

  const hammingMission = MISSIONS[4];
  const hamming = createSession(hammingMission);
  prepareStory(hamming, hammingMission);
  hamming.guide.intro = STORY[5].scenes.length;
  assert.equal(advanceStory(hamming, hammingMission, "lab"), false);
  assert.equal(advanceStory(hamming, hammingMission, "lab-proof"), true);
  hamming.protection = "hamming";
  assert.equal(advanceStory(hamming, hammingMission, "protection"), true);
  assert.equal(storyCanSend(hamming, hammingMission), true);
});

test("from chapter six onward the story never dictates a solution or requires a designated protection", () => {
  for (const mission of MISSIONS.filter(({ independent }) => independent)) {
    const session = createSession(mission);
    prepareStory(session, mission);
    assert.deepEqual(session.selectedIds, []);
    assert.equal(storyCanSend(session, mission), false, "the intro still comes first");
    session.guide.intro = STORY[mission.id].scenes.length;
    assert.equal(storyStep(session, mission).action, "dispatch");
    assert.equal(storyCanSend(session, mission), true);
    for (const action of ["packet", "auto", "protection", "next", "tree-apply"]) {
      assert.equal(advanceStory(session, mission, action), false);
    }
    assert.equal(session.guide.phase, 0);
  }
});

test("experienced players can skip the guide without changing message outcomes", () => {
  for (const mission of MISSIONS) {
    const session = createSession(mission);
    prepareStory(session, mission);
    session.guide.intro = STORY[mission.id].scenes.length;
    session.guide.skipped = true;
    assert.equal(storyStep(session, mission).action, "dispatch");
    assert.equal(storyCanSend(session, mission), true);
    assert.equal(session.history.length, 0);
  }
});

test("malformed stored guide fields are normalized to usable steps", () => {
  const mission = MISSIONS[0];
  const session = createSession(mission);
  session.guide = { version: 1, intro: 99, phase: -4, demo: "unknown", quiz: "2", skipped: "yes" };
  prepareStory(session, mission);
  assert.equal(session.guide.intro, 3);
  assert.equal(session.guide.phase, 0);
  assert.equal(session.guide.demo, null);
  assert.equal(session.guide.quiz, null);
  assert.equal(session.guide.skipped, false);
  assert.equal(storyStep(session, mission).action, "packet");
});

test("every playable mission has a complete story and the return campaign gives no procedural solution", () => {
  for (const mission of MISSIONS) {
    const chapter = STORY[mission.id];
    assert.ok(chapter.location);
    assert.ok(chapter.scenes.length);
    assert.ok(chapter.reply);
    for (const scene of chapter.scenes) {
      for (const field of ["speaker", "role", "title", "text", "button"]) assert.ok(scene[field]);
    }
    if (mission.id >= 13) {
      assert.deepEqual(chapter.steps.map(({ action }) => action), ["dispatch"]);
      assert.equal(chapter.learning, "");
    }
  }
});
