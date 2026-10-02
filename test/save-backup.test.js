import test from "node:test";
import assert from "node:assert/strict";
import { archiveChapter, resumeChapter } from "../.build/src/shared/chapter-drafts.js";
import { exportBackup, importBackup, mergeBackup } from "../.build/src/shared/save-backup.js";
import * as information from "../.build/src/games/information/storage.js";
import * as harbor from "../.build/src/games/game-theory/storage.js";
import * as repair from "../.build/src/games/probability/storage.js";
import * as network from "../.build/src/games/network/storage.js";
import { createSession as informationSession } from "../.build/src/games/information/engine.js";
import { MISSIONS as informationMissions } from "../.build/src/games/information/missions.js";
import { prepareStory } from "../.build/src/games/information/story.js";

const games = [
  ["information", information, () => ({
    version: 1, activeId: 1, progress: { unlocked: 1, best: {}, soloBest: {}, lessons: [] },
    session: prepareStory(informationSession(informationMissions[0]), informationMissions[0]),
  })],
  ["game-theory", harbor, harbor.freshSave],
  ["probability", repair, repair.freshSave],
  ["network", network, network.freshSave],
];
const read = (module, save) => module.readSave("test", { getItem: () => JSON.stringify(save) });

test("all games preserve chapter attempts through storage and backup round trips", () => {
  for (const [game, module, fresh] of games) {
    const save = fresh();
    if (game === "information") save.session.guide.demo = "A";
    else if (game === "game-theory") save.guide.answer = "rush";
    else if (game === "probability") save.plans[0].red = "replace";
    else save.codes = ["SA"];
    const expected = read(module, save);
    const nextChapter = { ...fresh(), activeId: 2 };
    if (game === "information") {
      nextChapter.progress.unlocked = 2;
      nextChapter.session = prepareStory(informationSession(informationMissions[1]), informationMissions[1]);
    }
    const current = read(module, nextChapter);
    assert.equal(current.activeId, 2);
    current.chapters = archiveChapter(expected);
    const score = game === "information" ? current.progress.best : current.best;
    score[1] = 3;
    if (game === "information") current.progress.unlocked = 2;
    else if (current.unlocked !== undefined) current.unlocked = 2;
    const progress = game === "information" ? { progress: current.progress } : { best: current.best, solo: current.solo, ...(current.unlocked ? { unlocked: current.unlocked } : {}) };
    const resumed = resumeChapter(current, 1, module.readSave, progress);
    const expectedResumed = read(module, { ...expected, ...progress });
    assert.deepEqual(resumed, { ...expectedResumed, chapters: current.chapters }, game);
    const text = exportBackup(game, current, module.readSave);
    assert.deepEqual(importBackup(text, game, module.readSave), current, game);
    assert.throws(() => importBackup(text, `${game}-wrong`, module.readSave), /这款游戏/);
    assert.throws(() => importBackup("{", game, module.readSave), /有效/);
    const bad = JSON.parse(text);
    bad.save.activeId = 999;
    assert.throws(() => importBackup(JSON.stringify(bad), game, module.readSave), /无法恢复/);
    bad.save = JSON.parse(text).save;
    bad.save.chapters["1"] = { ...bad.save.chapters["1"], activeId: 2 };
    assert.throws(() => importBackup(JSON.stringify(bad), game, module.readSave));
  }
});

test("import keeps better local achievements and other chapter drafts without altering the source", () => {
  for (const [game, , fresh] of games) {
    const current = fresh();
    const imported = fresh();
    const localScores = game === "information" ? current.progress.best : current.best;
    const backupScores = game === "information" ? imported.progress.best : imported.best;
    localScores[1] = 3;
    backupScores[1] = 2;
    backupScores[2] = 3;
    current.chapters = { 2: { version: 1, activeId: 2, marker: "local" } };
    const snapshot = structuredClone(current);
    const merged = mergeBackup(current, imported);
    assert.deepEqual(game === "information" ? merged.progress.best : merged.best, { 1: 3, 2: 3 });
    assert.equal(merged.chapters[2].marker, "local");
    assert.equal(merged.chapters[1], undefined, "the imported active attempt wins");
    assert.deepEqual(current, snapshot);
  }
});

test("damaged decisions and forged results are rejected before replacing current progress", () => {
  for (const [game, module, fresh] of games) {
    const data = JSON.parse(exportBackup(game, fresh(), module.readSave));
    if (game === "information") data.save.session.totalBits = 999;
    else if (game === "game-theory") data.save.session.cash = [999, 999];
    else if (game === "probability") data.save.plans[0].detectorId = "missing";
    else data.save.routes = [{ nodes: ["S", "missing", "T"], amount: 1 }];
    assert.throws(() => importBackup(JSON.stringify(data), game, module.readSave), /无法恢复/, game);
  }
});
