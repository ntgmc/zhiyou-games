import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { GameAudio, normalizeAudioSettings, sceneTrack } from "../.build/src/games/information/audio.js";
import { GameAudio as SharedAudio } from "../.build/src/shared/audio.js";
import { GAME_MUSIC } from "../.build/src/shared/music.js";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));
const players = [];
afterEach(() => { for (const audio of players.splice(0)) audio.stopAll(0); });

function harness({ saved, blockedStorage = false, track } = {}) {
  const requests = [];
  const sources = [];
  const media = [];
  const values = new Map(saved ? [["audio", JSON.stringify(saved)]] : []);
  const parameter = () => ({
    value: 0,
    ramps: [],
    setValueAtTime(value) { this.value = value; },
    linearRampToValueAtTime(value, time) { this.value = value; this.ramps.push({ value, time }); },
    setTargetAtTime(value) { this.value = value; },
    cancelAndHoldAtTime() {},
    cancelScheduledValues() {},
  });
  const context = {
    state: "suspended", currentTime: 0, destination: {},
    async resume() { this.state = "running"; this.onstatechange?.(); },
    async suspend() { this.state = "suspended"; this.onstatechange?.(); },
    createGain() { return { gain: parameter(), connect() {}, disconnect() {} }; },
    createMediaElementSource(media) {
      const source = { media, connect() {}, disconnect() { this.disconnected = true; } };
      sources.push(source);
      return source;
    },
    createBufferSource() { assert.fail("music must stream through a media element"); },
    decodeAudioData() { assert.fail("music must not wait for whole-file decoding"); },
  };
  const errors = [];
  const Player = track ? SharedAudio : GameAudio;
  const audio = new Player({
    ...(track ? { tracks: [track] } : {}),
    storageKey: "audio",
    storage: {
      getItem(key) { if (blockedStorage) throw new Error("Storage disabled"); return values.get(key) || null; },
      setItem(key, value) { if (blockedStorage) throw new Error("Storage disabled"); values.set(key, value); },
    },
    contextFactory: () => context,
    mediaFactory() {
      const element = {
        src: "", paused: true, readyState: 0, currentTime: 0, playCalls: 0,
        play() {
          this.playCalls++;
          this.paused = false;
          if (this.blocked) return Promise.reject(new DOMException("Gesture required", "NotAllowedError"));
          if (this.readyState >= 3) { this.onplaying?.(); return Promise.resolve(); }
          if (!this.request) {
            const url = new URL(this.src);
            this.request = { id: url.pathname.split("/").at(-1), url, media: this, complete: false, ...deferred() };
            requests.push(this.request);
          }
          return this.request.promise;
        },
        pause() { this.paused = true; },
        removeAttribute(name) { if (name === "src") this.src = ""; },
        load() {
          if (!this.src && this.request) {
            this.request.cancelled = true;
            this.request.reject(new DOMException("Playback cancelled", "AbortError"));
          }
        },
      };
      media.push(element);
      return element;
    },
    onError: (message) => errors.push(message),
  });
  players.push(audio);
  const deliver = async (request, ok = true) => {
    if (!ok) {
      request.media.error = new Error("Music HTTP 404");
      request.media.onerror?.();
      request.reject(request.media.error);
    } else {
      if (!request.cancelled) {
        request.media.readyState = 3;
        request.media.onplaying?.();
      }
      request.resolve();
    }
    await settle();
  };
  return { audio, requests, sources, media, context, errors, values, deliver };
}

for (const [game, track] of Object.entries(GAME_MUSIC)) {
  test(`${game} loads its own theme on demand and keeps the loop across chapters and results`, async () => {
    const h = harness({ track, saved: { enabled: true, volume: 0.18, track: "storm" } });
    assert.equal(h.audio.settings.track, "auto", "another game's fixed track cannot leak into this game");
    assert.equal(h.audio.state.trackId, track.id);
    h.audio.setScene({ missionId: 1, intro: true });
    assert.equal(h.requests.length, 0);
    await h.audio.unlock();
    assert.equal(h.requests[0].id, track.file);
    assert.ok(h.requests[0].url.pathname.endsWith(`/assets/music/${track.file}`));
    await h.deliver(h.requests[0]);
    const voice = h.audio.current;
    assert.equal(voice.media.loop, true);
    assert.equal(voice.media.preload, "none");
    assert.equal(h.requests[0].complete, false, "playback starts with only the initial buffer");
    assert.equal(h.audio.master.gain.value, 0.18);
    for (const scene of [{ missionId: 24 }, { status: "lost" }, { status: "won" }, { intro: true }]) h.audio.setScene(scene);
    await settle();
    assert.equal(h.audio.current, voice);
    assert.equal(h.requests.length, 1);
    await h.audio.setHidden(true);
    assert.equal(h.audio.state.playing, false);
    await h.audio.setHidden(false);
    assert.equal(h.audio.current, voice);
    await h.audio.setEnabled(false);
    assert.equal(voice.stopping, true);
    const saved = JSON.parse(h.values.get("audio"));
    assert.equal(saved.enabled, false);
    assert.equal(saved.volume, 0.18);
  });
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
    assert.equal(h.sources.length, 1, "the active stream must not restart");
    assert.equal(current.stopping, false);
    assert.equal(h.requests.length, 1);
    assert.equal(h.audio.voices.size, 1);
    assert.equal(h.audio.state.loading, false);
  }
});

test("entering practice and completing a mission still crossfade, while intermediate rounds keep playing", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = harness();
  h.audio.setScene({ missionId: 9, intro: true });
  await h.audio.setEnabled(true);
  await h.deliver(h.requests[0]);
  const opening = h.audio.current;
  h.audio.setScene({ missionId: 9 });
  assert.equal(h.audio.current, opening, "the old track continues while the next buffers");
  await h.deliver(h.requests[1]);
  assert.equal(h.audio.current.trackId, "storm");
  assert.equal(opening.stopping, true);
  assert.deepEqual(h.audio.current.gain.gain.ramps, [{ value: 1, time: 1.8 }]);
  assert.equal(opening.media.paused, false, "the old track fades as the next starts");
  t.mock.timers.tick(1820);
  assert.equal(opening.media.paused, true);
  assert.equal(opening.media.src, "");
  assert.equal(opening.source.disconnected, true);
  const practice = h.audio.current;
  h.audio.setScene({ missionId: 10 });
  await settle();
  assert.equal(h.audio.current, practice, "the same atmosphere continues across rounds and chapters");
  h.audio.setScene({ missionId: 10, status: "won" });
  await h.deliver(h.requests[2]);
  assert.equal(h.audio.current.trackId, "arrival");
  assert.equal(practice.stopping, true);
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
  assert.equal(restored.media[0].loop, true);
  assert.equal(restored.audio.master.gain.value, 0.25);
});

test("muting while a track buffers cancels its stream and prevents late playback", async () => {
  const h = harness();
  await h.audio.setEnabled(true);
  await h.audio.setEnabled(false);
  await h.deliver(h.requests[0]);
  assert.equal(h.requests[0].cancelled, true);
  assert.equal(h.media[0].paused, true);
  assert.equal(h.media[0].src, "");
  assert.equal(h.sources[0].disconnected, true);
  assert.equal(h.audio.voices.size, 0);
  assert.equal(h.audio.state.loading, false);
  assert.equal(h.audio.state.playing, false);
  await h.audio.setEnabled(true);
  await h.deliver(h.requests[1]);
  assert.equal(h.audio.state.playing, true);
});

test("rapid track changes cancel outdated streams and cannot duplicate a loop", async () => {
  const h = harness();
  await h.audio.setEnabled(true);
  await h.deliver(h.requests[0]);
  h.audio.setTrack("storm");
  h.audio.setTrack("arrival");
  await h.deliver(h.requests[1]);
  assert.equal(h.requests[1].cancelled, true);
  assert.equal(h.audio.current.trackId, "orbit");
  await h.deliver(h.requests[2]);
  assert.equal(h.audio.current.trackId, "arrival");
  assert.equal(h.media[1].src, "");
  assert.equal(h.sources[1].disconnected, true);
  h.audio.setScene({ missionId: 7 });
  await settle();
  assert.equal(h.requests.length, 3, "manual track stays fixed as the scene changes");
  h.audio.setTrack("arrival");
  assert.equal(h.sources.length, 3, "selecting the current track does not start another source");
  assert.equal(h.audio.current.media.playCalls, 1);
});

test("returning to the current track cancels an in-flight switch", async () => {
  const h = harness();
  await h.audio.setEnabled(true);
  await h.deliver(h.requests[0]);
  h.audio.setTrack("storm");
  h.audio.setTrack("orbit");
  await h.deliver(h.requests[1]);
  assert.equal(h.audio.current.trackId, "orbit");
  assert.equal(h.requests[1].cancelled, true);
  assert.equal(h.media[1].src, "");
  assert.equal(h.audio.current.media.playCalls, 1);
  assert.equal(h.audio.state.loading, false);
});

test("hidden pages pause at the same position and cancel pending streams; visibility resumes the selected track", async () => {
  const h = harness();
  await h.audio.setEnabled(true);
  await h.deliver(h.requests[0]);
  const opening = h.audio.current;
  opening.media.currentTime = 12;
  await h.audio.setHidden(true);
  assert.equal(h.context.state, "suspended");
  assert.equal(h.audio.state.playing, false);
  assert.equal(opening.media.paused, true);
  await h.audio.setHidden(false);
  await settle();
  assert.equal(h.audio.current, opening);
  assert.equal(opening.media.currentTime, 12);
  assert.equal(h.requests.length, 1);
  await h.audio.setHidden(true);
  h.audio.setTrack("code");
  assert.equal(h.requests.length, 1);
  await h.audio.setHidden(false);
  assert.equal(h.requests[1].id, "code.mp3");
  await h.audio.setHidden(true);
  await h.deliver(h.requests[1]);
  assert.equal(h.requests[1].cancelled, true);
  assert.equal(h.audio.current, opening);
  await h.audio.setHidden(false);
  await h.deliver(h.requests[2]);
  assert.equal(h.audio.current.trackId, "code");
  assert.equal(h.requests.length, 3);
});

test("stream failures are recoverable and unavailable storage does not block music", async () => {
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

test("media playback starts within the gesture without waiting for the audio context resume promise", async () => {
  const h = harness();
  const resumed = deferred();
  h.context.resume = () => resumed.promise;
  const enabled = h.audio.setEnabled(true);
  assert.equal(h.requests.length, 1);
  assert.equal(h.audio.state.loading, true);
  await h.deliver(h.requests[0]);
  h.context.state = "running";
  resumed.resolve();
  await enabled;
  assert.equal(h.audio.state.playing, true);
});

test("browser autoplay rejection waits for another gesture and can be retried", async () => {
  const h = harness();
  const factory = h.audio.mediaFactory;
  h.audio.mediaFactory = () => { const media = factory(); media.blocked = true; return media; };
  await h.audio.setEnabled(true);
  await settle();
  assert.equal(h.audio.state.waiting, true);
  assert.equal(h.audio.state.error, "");
  assert.equal(h.audio.voices.size, 0);
  h.audio.mediaFactory = factory;
  await h.audio.unlock();
  await h.deliver(h.requests[0]);
  assert.equal(h.audio.state.waiting, false);
  assert.equal(h.audio.state.playing, true);
});

test("buffer stalls and errors after playback starts update the status and allow recovery", async () => {
  const h = harness();
  await h.audio.setEnabled(true);
  await h.deliver(h.requests[0]);
  const media = h.audio.current.media;
  media.readyState = 2;
  media.onwaiting();
  assert.equal(h.audio.state.loading, true);
  assert.equal(h.audio.state.playing, false);
  media.readyState = 3;
  media.onplaying();
  assert.equal(h.audio.state.loading, false);
  assert.equal(h.audio.state.playing, true);
  media.error = new Error("Stream connection lost");
  media.onerror();
  assert.equal(h.audio.state.playing, false);
  assert.equal(h.errors.length, 1);
  await h.audio.setEnabled(true);
  await h.deliver(h.requests[1]);
  assert.equal(h.audio.state.error, "");
  assert.equal(h.audio.state.playing, true);
});

test("turning music off fades then releases the playing stream", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = harness();
  await h.audio.setEnabled(true);
  await h.deliver(h.requests[0]);
  const voice = h.audio.current;
  await h.audio.setEnabled(false);
  assert.equal(voice.media.paused, false);
  t.mock.timers.tick(371);
  assert.equal(voice.media.paused, true);
  assert.equal(voice.media.src, "");
  assert.equal(h.audio.voices.size, 0);
});
