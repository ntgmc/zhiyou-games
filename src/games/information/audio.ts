interface AudioSettings { enabled: boolean; volume: number; track: string }
interface Scene { missionId?: number; intro?: boolean; status?: string }
interface Voice { source: AudioBufferSourceNode; gain: GainNode; trackId: string; stopping: boolean }
interface AudioOptions {
  storageKey?: string;
  storage?: Pick<Storage, "getItem" | "setItem">;
  contextFactory?: () => AudioContext;
  fetcher?: (url: URL) => Promise<Response>;
  onChange?: (state: AudioState) => void;
  onError?: (message: string, error: unknown) => void;
}
export interface AudioState extends AudioSettings {
  trackId: string; playing: boolean; loading: boolean; waiting: boolean; hidden: boolean; error: string;
}

export const MUSIC_TRACKS = [
  { id: "orbit", title: "轨道晨光", description: "缓慢的合成器长音，适合开场和航行。", scene: "剧情 · 航行", file: "orbit.mp3" },
  { id: "code", title: "码间微光", description: "轻柔、规律的琶音，解题时可以循环听。", scene: "学习 · 解题", file: "code.mp3" },
  { id: "storm", title: "风暴边界", description: "低频脉冲带来一点紧张感，伴随有干扰的任务。", scene: "干扰 · 调度", file: "storm.mp3" },
  { id: "arrival", title: "远方回声", description: "温暖的和声与铃音，在任务完成后响起。", scene: "回信 · 完成", file: "arrival.mp3" },
];

// The score follows the chapter's phase, never temporary tools or sending animations.
export function sceneTrack({ missionId = 1, intro = false, status = "playing" }: Scene = {}): string {
  if (status === "won") return "arrival";
  if (intro) return "orbit";
  if (status === "lost" || missionId >= 4) return "storm";
  return "code";
}

export function normalizeAudioSettings(value: Partial<Record<keyof AudioSettings, unknown>> | null = {}): AudioSettings {
  return {
    enabled: value?.enabled === true,
    volume: typeof value?.volume === "number" && Number.isFinite(value.volume)
      ? Math.max(0, Math.min(1, value.volume)) : 0.3,
    track: typeof value?.track === "string" && (value.track === "auto" || MUSIC_TRACKS.some(({ id }) => id === value.track)) ? value.track : "auto",
  };
}

/** One lazy audio context, circular buffers and cancellable, crossfaded scene changes. */
export class GameAudio {
  storageKey: string;
  storage?: Pick<Storage, "getItem" | "setItem">;
  settings: AudioSettings;
  onChange: NonNullable<AudioOptions["onChange"]>;
  onError: NonNullable<AudioOptions["onError"]>;
  contextFactory: () => AudioContext;
  fetcher: NonNullable<AudioOptions["fetcher"]>;
  scene: string;
  context: AudioContext | null;
  master: GainNode | null;
  current: Voice | null;
  voices: Set<Voice>;
  buffers: Map<string, Promise<AudioBuffer>>;
  request: number;
  unlocked: boolean;
  hidden: boolean;
  loading: boolean;
  error: string;
  pendingTrack: string | null;

  constructor({ storageKey = "deep-space-comms-audio", storage, contextFactory, fetcher, onChange = () => {}, onError = () => {} }: AudioOptions = {}) {
    this.storageKey = storageKey;
    this.onChange = onChange;
    this.onError = onError;
    this.contextFactory = contextFactory || (() => {
      const browser = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
      const Context = browser.AudioContext || browser.webkitAudioContext;
      if (!Context) throw new Error("Web Audio is unavailable");
      return new Context();
    });
    this.fetcher = fetcher || ((url) => fetch(url));
    try {
      this.storage = storage || globalThis.localStorage;
      this.settings = normalizeAudioSettings(JSON.parse(this.storage?.getItem(storageKey) || "null"));
    } catch {
      this.settings = normalizeAudioSettings();
    }
    this.scene = "orbit";
    this.context = null;
    this.master = null;
    this.current = null;
    this.voices = new Set();
    this.buffers = new Map();
    this.request = 0;
    this.unlocked = false;
    this.hidden = false;
    this.loading = false;
    this.error = "";
    this.pendingTrack = null;
  }

  get trackId() {
    return this.settings.track === "auto" ? this.scene : this.settings.track;
  }

  get state(): AudioState {
    return {
      ...this.settings,
      trackId: this.trackId,
      playing: this.settings.enabled && !this.hidden && this.context?.state === "running" && !!this.current,
      loading: this.loading,
      waiting: this.settings.enabled && !this.unlocked,
      hidden: this.hidden,
      error: this.error,
    };
  }

  notify() {
    this.onChange(this.state);
  }

  persist() {
    try { this.storage?.setItem(this.storageKey, JSON.stringify(this.settings)); } catch { /* Playing works without storage. */ }
  }

  setScene(scene: Scene) {
    const next = sceneTrack(scene);
    if (this.scene === next) return;
    this.scene = next;
    this.sync();
  }

  setTrack(track: string) {
    this.settings.track = normalizeAudioSettings({ ...this.settings, track }).track;
    this.error = "";
    this.persist();
    this.sync();
  }

  setVolume(volume: number) {
    this.settings.volume = normalizeAudioSettings({ ...this.settings, volume }).volume;
    this.persist();
    if (this.master && this.context) this.master.gain.setTargetAtTime(this.settings.volume, this.context.currentTime, 0.08);
    this.notify();
  }

  async setEnabled(enabled: boolean) {
    this.settings.enabled = enabled === true;
    this.error = "";
    this.persist();
    if (!this.settings.enabled) {
      this.request++;
      this.pendingTrack = null;
      this.loading = false;
      this.stopAll(0.35);
      this.notify();
      return;
    }
    await this.unlock();
  }

  async unlock() {
    if (!this.settings.enabled || this.hidden) return;
    try {
      if (!this.context) {
        this.context = this.contextFactory();
        this.master = this.context.createGain();
        this.master.gain.value = this.settings.volume;
        this.master.connect(this.context.destination);
        this.context.onstatechange = () => this.notify();
      }
      // Called directly from an interaction so mobile autoplay policies can allow it.
      await this.context.resume();
      this.unlocked = this.context.state === "running";
      this.sync();
    } catch (error) {
      this.fail(error);
    }
  }

  async setHidden(hidden: boolean) {
    this.hidden = hidden;
    if (hidden) {
      this.request++;
      this.pendingTrack = null;
      this.loading = false;
      try { await this.context?.suspend(); } catch { /* Browser may already have suspended it. */ }
      this.notify();
    } else if (this.settings.enabled && this.unlocked && this.context) {
      try {
        await this.context.resume();
        this.sync();
      } catch {
        this.unlocked = false;
        this.notify();
      }
    } else this.notify();
  }

  async load(trackId: string) {
    if (!this.buffers.has(trackId)) {
      const track = MUSIC_TRACKS.find(({ id }) => id === trackId);
      if (!track || !this.context) throw new Error("Unknown music track or unavailable audio context");
      const context = this.context;
      const pending = (async () => {
        const response = await this.fetcher(new URL(`../../../assets/music/${track.file}`, import.meta.url));
        if (!response.ok) throw new Error(`Music HTTP ${response.status}`);
        return context.decodeAudioData(await response.arrayBuffer());
      })();
      this.buffers.set(trackId, pending);
      pending.catch(() => {
        if (this.buffers.get(trackId) === pending) this.buffers.delete(trackId);
      });
    }
    return this.buffers.get(trackId)!;
  }

  async sync() {
    const trackId = this.trackId;
    if (!this.settings.enabled || !this.unlocked || this.hidden || this.error) {
      this.notify();
      return;
    }
    if (this.pendingTrack === trackId || this.current?.trackId === trackId) {
      // Invalidate an in-flight switch when the player goes back to the current track.
      if (this.pendingTrack && this.pendingTrack !== trackId) {
        this.request++;
        this.pendingTrack = null;
        this.loading = false;
      }
      this.notify();
      return;
    }
    const request = ++this.request;
    this.pendingTrack = trackId;
    this.loading = true;
    this.notify();
    try {
      const buffer = await this.load(trackId);
      if (request !== this.request || !this.settings.enabled || this.hidden) return;
      if (!this.context || !this.master) return;
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain);
      gain.connect(this.master);
      const now = this.context.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(1, now + 1.8);
      this.stopAll(1.8);
      const voice = { source, gain, trackId, stopping: false };
      this.voices.add(voice);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        this.voices.delete(voice);
      };
      source.start(now);
      this.current = voice;
      this.pendingTrack = null;
      this.loading = false;
      this.notify();
    } catch (error) {
      if (request === this.request) this.fail(error);
    }
  }

  stopAll(duration: number) {
    const now = this.context?.currentTime || 0;
    for (const voice of this.voices) {
      if (voice.stopping) continue;
      voice.stopping = true;
      // Hold the actual value if supported; otherwise avoid a sudden gain jump.
      if (voice.gain.gain.cancelAndHoldAtTime) voice.gain.gain.cancelAndHoldAtTime(now);
      else voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.linearRampToValueAtTime(0, now + duration);
      voice.source.stop(now + duration + 0.02);
    }
    this.current = null;
  }

  fail(error: unknown) {
    this.request++;
    this.pendingTrack = null;
    this.loading = false;
    this.error = "音乐暂时无法播放，请再点一次开启。";
    this.stopAll(0.2);
    this.notify();
    this.onError(this.error, error);
  }
}
