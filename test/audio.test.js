import test from "node:test";
import assert from "node:assert/strict";
import { GameAudio, normalizeAudioSettings, sceneTrack } from "../.build/src/games/information/audio.js";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

function harness({ saved, blockedStorage = false } = {}) {
  const requests = [];
  const sources = [];
  const values = new Map(saved ? [["audio", JSON.stringify(saved)]] : []);
  const parameter = () => ({
    value: 0,
    setValueAtTime(value) { this.value = value; },
    linearRampToValueAtTime(value) { this.value = value; },
    setTargetAtTime(value) { this.value = value; },
    cancelAndHoldAtTime() {},
    cancelScheduledValues() {},
  });
  const context = {
    state: "suspended", currentTime: 0, destination: {},
    async resume() { this.state = "running"; this.onstatechange?.(); },
    async suspend() { this.state = "suspended"; this.onstatechange?.(); },
    createGain() { return { gain: parameter(), connect() {}, disconnect() {} }; },
    createBufferSource() {
      const source = { connect() {}, disconnect() {}, start() { this.started = true; }, stop() { this.stopped = true; } };
      sources.push(source);
      return source;
    },
    async decodeAudioData(value) { return { value }; },
  };
  const errors = [];
  const audio = new GameAudio({
    storageKey: "audio",
    storage: {
      getItem(key) { if (blockedStorage) throw new Error("Storage disabled"); return values.get(key) || null; },
      setItem(key, value) { if (blockedStorage) throw new Error("Storage disabled"); values.set(key, value); },
    },
    contextFactory: () => context,
    fetcher(url) {
      const pending = deferred();
      requests.push({ id: url.pathname.split("/").at(-1), ...pending });
      return pending.promise;
    },
    onError: (message) => errors.push(message),
  });
  const deliver = async (request, ok = true) => {
    request.resolve({ ok, status: ok ? 200 : 404, arrayBuffer: async () => new ArrayBuffer(8) });
    await settle();
  };
  return { audio, requests, sources, context, errors, values, deliver };
}

test("scene selection follows chapter phases and ignores temporary tools and transmissions", () => {
  assert.equal(sceneTrack({ missionId: 1, intro: true }), "orbit");
  assert.equal(sceneTrack({ missionId: 2 }), "code");
  assert.equal(sceneTrack({ missionId: 5 }), "storm");
  assert.equal(sceneTrack({ missionId: 5, studying: true }), "storm");
  assert.equal(sceneTrack({ missionId: 1, intro: true, studying: true }), "orbit");
  assert.equal(sceneTrack({ missionId: 1, transmitting: true }), "code");
  assert.equal(sceneTrack({ missionId: 8, intro: true, status: "won" }), "arrival");
  assert.deepEqual(normalizeAudioSettings({ enabled: "yes", volume: NaN, track: "../unknown" }),
    { enabled: false, volume: 0.3, track: "auto" });
  assert.equal(normalizeAudioSettings({ volume: 100 }).volume, 1);
});

test("repeatedly opening tools or sending signals preserves the current loop without restarting or loading another track", async () => {
  for (const scene of [{ missionId: 2 }, { missionId: 9 }, { missionId: 9, status: "won" }]) {
    const h = harness();
    h.audio.setScene(scene);
    await h.audio.setEnabled(true);
    await h.deliver(h.requests[0]);
    const current = h.audio.current;
    for (let i = 0; i < 5; i++) {
      h.audio.setScene({ ...scene, studying: true });
      h.audio.setScene(scene);
      h.audio.setScene({ ...scene, transmitting: true });
      h.audio.setScene(scene);
    }
    await settle();
    assert.equal(h.audio.current, current);
    assert.equal(h.sources.length, 1, "cached tracks must not restart either");
    assert.equal(h.sources[0].stopped, undefined);
    assert.equal(h.requests.length, 1);
    assert.equal(h.audio.voices.size, 1);
    assert.equal(h.audio.state.loading, false);
  }
});

test("entering practice and completing a mission still crossfade, while intermediate rounds keep playing", async () => {
  const h = harness();
  h.audio.setScene({ missionId: 9, intro: true });
  await h.audio.setEnabled(true);
  await h.deliver(h.requests[0]);
  h.audio.setScene({ missionId: 9 });
  await h.deliver(h.requests[1]);
  assert.equal(h.audio.current.trackId, "storm");
  assert.equal(h.sources[0].stopped, true);
  const practice = h.audio.current;
  h.audio.setScene({ missionId: 10 });
  await settle();
  assert.equal(h.audio.current, practice, "the same atmosphere continues across rounds and chapters");
  h.audio.setScene({ missionId: 10, status: "won" });
  await h.deliver(h.requests[2]);
  assert.equal(h.audio.current.trackId, "arrival");
  assert.equal(h.sources[1].stopped, true);
  assert.equal(h.sources.length, 3);
});

test("first visits and restored preferences do not fetch or play before a gesture", async () => {
  const first = harness();
  first.audio.setScene({ missionId: 4 });
  await settle();
  assert.equal(first.requests.length, 0);
  assert.equal(first.audio.context, null);
  const restored = harness({ saved: { enabled: true, volume: 0.25, track: "auto" } });
  restored.audio.setScene({ missionId: 1, intro: true });
  assert.equal(restored.requests.length, 0);
  assert.equal(restored.audio.state.waiting, true);
  await restored.audio.unlock();
  assert.equal(restored.requests.length, 1);
  await restored.deliver(restored.requests[0]);
  assert.equal(restored.audio.state.playing, true);
  assert.equal(restored.sources[0].loop, true);
  assert.equal(restored.audio.master.gain.value, 0.25);
});

test("muting while a track downloads prevents a late response from starting audio", async () => {
  const h = harness();
  await h.audio.setEnabled(true);
  await h.audio.setEnabled(false);
  await h.deliver(h.requests[0]);
  assert.equal(h.sources.length, 0);
  assert.equal(h.audio.state.loading, false);
  assert.equal(h.audio.state.playing, false);
  await h.audio.setEnabled(true);
  await settle();
  assert.equal(h.requests.length, 1, "the already decoded buffer is reused");
  assert.equal(h.sources.length, 1);
});

test("rapid track changes cannot play an outdated download or duplicate a loop", async () => {
  const h = harness();
  await h.audio.setEnabled(true);
  await h.deliver(h.requests[0]);
  h.audio.setTrack("storm");
  h.audio.setTrack("arrival");
  await h.deliver(h.requests[1]);
  assert.equal(h.sources.length, 1);
  await h.deliver(h.requests[2]);
  assert.equal(h.audio.current.trackId, "arrival");
  assert.equal(h.sources[0].stopped, true);
  h.audio.setScene({ missionId: 7 });
  await settle();
  assert.equal(h.requests.length, 3, "manual track stays fixed as the scene changes");
  h.audio.setTrack("arrival");
  assert.equal(h.sources.length, 2, "selecting the current track does not start another source");
});

test("returning to the current track cancels an in-flight switch", async () => {
  const h = harness();
  await h.audio.setEnabled(true);
  await h.deliver(h.requests[0]);
  h.audio.setTrack("storm");
  h.audio.setTrack("orbit");
  await h.deliver(h.requests[1]);
  assert.equal(h.audio.current.trackId, "orbit");
  assert.equal(h.sources.length, 1);
  assert.equal(h.audio.state.loading, false);
});

test("hidden pages suspend playback and stale downloads; visibility resumes the selected track", async () => {
  const h = harness();
  await h.audio.setEnabled(true);
  await h.deliver(h.requests[0]);
  await h.audio.setHidden(true);
  assert.equal(h.context.state, "suspended");
  assert.equal(h.audio.state.playing, false);
  h.audio.setTrack("code");
  assert.equal(h.requests.length, 1);
  await h.audio.setHidden(false);
  assert.equal(h.requests[1].id, "code.mp3");
  await h.audio.setHidden(true);
  await h.deliver(h.requests[1]);
  assert.equal(h.sources.length, 1);
  await h.audio.setHidden(false);
  await settle();
  assert.equal(h.audio.current.trackId, "code");
  assert.equal(h.requests.length, 2);
});

test("download failures are recoverable and unavailable storage does not block music", async () => {
  const h = harness({ blockedStorage: true });
  await h.audio.setEnabled(true);
  await h.deliver(h.requests[0], false);
  assert.equal(h.errors.length, 1);
  assert.match(h.audio.state.error, /无法播放/);
  await h.audio.setEnabled(true);
  await h.deliver(h.requests[1]);
  assert.equal(h.audio.state.error, "");
  assert.equal(h.audio.state.playing, true);
  h.audio.setVolume(0);
  assert.equal(h.audio.master.gain.value, 0);
  assert.equal(h.audio.settings.volume, 0);
});
