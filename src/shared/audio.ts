interface AudioSettings { enabled: boolean; volume: number; track: string }
export interface Scene { missionId?: number; intro?: boolean; status?: string }
export interface MusicTrack { id: string; title: string; file: string }
interface Voice {
  media: HTMLAudioElement; source: MediaElementAudioSourceNode; gain: GainNode;
  trackId: string; stopping: boolean; timer?: ReturnType<typeof setTimeout>;
}
export interface AudioOptions {
  tracks: readonly MusicTrack[];
  selectTrack?: (scene: Scene) => string;
  storageKey?: string;
  storage?: Pick<Storage, "getItem" | "setItem">;
  contextFactory?: () => AudioContext;
  mediaFactory?: () => HTMLAudioElement;
  onChange?: (state: AudioState) => void;
  onError?: (message: string, error: unknown) => void;
}
export interface AudioState extends AudioSettings {
  trackId: string; playing: boolean; loading: boolean; waiting: boolean; hidden: boolean; error: string;
}

export function normalizeAudioSettings(value: Partial<Record<keyof AudioSettings, unknown>> | null, tracks: readonly MusicTrack[]): AudioSettings {
  return {
    enabled: value?.enabled === true,
    volume: typeof value?.volume === "number" && Number.isFinite(value.volume)
      ? Math.max(0, Math.min(1, value.volume)) : 0.3,
    track: typeof value?.track === "string" && (value.track === "auto" || tracks.some(({ id }) => id === value.track)) ? value.track : "auto",
  };
}

/** Lazy media streams with cancellable, crossfaded scene changes. */
export class GameAudio {
  tracks: readonly MusicTrack[];
  selectTrack: (scene: Scene) => string;
  storageKey: string;
  storage?: Pick<Storage, "getItem" | "setItem">;
  settings: AudioSettings;
  onChange: NonNullable<AudioOptions["onChange"]>;
  onError: NonNullable<AudioOptions["onError"]>;
  contextFactory: () => AudioContext;
  mediaFactory: NonNullable<AudioOptions["mediaFactory"]>;
  scene: string;
  context: AudioContext | null;
  master: GainNode | null;
  current: Voice | null;
  voices: Set<Voice>;
  request: number;
  unlocked: boolean;
  hidden: boolean;
  loading: boolean;
  error: string;
  pending: Voice | null;

  constructor({ tracks, selectTrack = () => tracks[0].id, storageKey = "game-audio", storage, contextFactory, mediaFactory, onChange = () => {}, onError = () => {} }: AudioOptions) {
    this.tracks = tracks;
    this.selectTrack = selectTrack;
    this.storageKey = storageKey;
    this.onChange = onChange;
    this.onError = onError;
    this.contextFactory = contextFactory || (() => {
      const browser = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
      const Context = browser.AudioContext || browser.webkitAudioContext;
      if (!Context) throw new Error("Web Audio is unavailable");
      return new Context();
    });
    this.mediaFactory = mediaFactory || (() => new Audio());
    try {
      this.storage = storage || globalThis.localStorage;
      this.settings = normalizeAudioSettings(JSON.parse(this.storage?.getItem(storageKey) || "null"), tracks);
    } catch {
      this.settings = normalizeAudioSettings(null, tracks);
    }
    this.scene = this.selectTrack({ intro: true });
    this.context = null;
    this.master = null;
    this.current = null;
    this.voices = new Set();
    this.request = 0;
    this.unlocked = false;
    this.hidden = false;
    this.loading = false;
    this.error = "";
    this.pending = null;
  }

  get trackId() {
    return this.settings.track === "auto" ? this.scene : this.settings.track;
  }

  get state(): AudioState {
    return {
      ...this.settings,
      trackId: this.trackId,
      playing: this.settings.enabled && !this.hidden && this.context?.state === "running"
        && !!this.current && !this.current.media.paused && this.current.media.readyState >= 3,
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
    const next = this.selectTrack(scene);
    if (this.scene === next) return;
    this.scene = next;
    this.sync();
  }

  setTrack(track: string) {
    this.settings.track = normalizeAudioSettings({ ...this.settings, track }, this.tracks).track;
    this.error = "";
    this.persist();
    this.sync();
  }

  setVolume(volume: number) {
    this.settings.volume = normalizeAudioSettings({ ...this.settings, volume }, this.tracks).volume;
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
      // Start both operations within the gesture, before yielding to a promise.
      const resumed = this.context.resume();
      this.unlocked = true;
      this.sync();
      await resumed;
      this.unlocked = this.unlocked && this.context.state === "running";
      this.notify();
    } catch (error) {
      this.fail(error);
    }
  }

  async setHidden(hidden: boolean) {
    this.hidden = hidden;
    if (hidden) {
      this.request++;
      this.loading = false;
      for (const voice of this.voices) {
        if (voice === this.current) voice.media.pause();
        else this.releaseVoice(voice);
      }
      try { await this.context?.suspend(); } catch { /* Browser may already have suspended it. */ }
      this.notify();
    } else if (this.settings.enabled && this.unlocked && this.context) {
      await this.unlock();
    } else this.notify();
  }

  async sync() {
    const trackId = this.trackId;
    if (!this.settings.enabled || !this.unlocked || this.hidden || this.error) {
      this.notify();
      return;
    }
    if (this.pending?.trackId === trackId) {
      this.notify();
      return;
    }
    if (this.current?.trackId === trackId) {
      if (this.pending) {
        this.request++;
        this.releaseVoice(this.pending);
        this.loading = this.current.media.readyState < 3;
      }
      if (!this.current.media.paused) {
        this.notify();
        return;
      }
    }
    const request = ++this.request;
    if (this.pending) this.releaseVoice(this.pending);
    this.loading = true;
    this.notify();
    try {
      if (!this.context || !this.master) throw new Error("Unavailable audio context");
      let voice = this.current?.trackId === trackId ? this.current : null;
      if (!voice) {
        const track = this.tracks.find(({ id }) => id === trackId);
        if (!track) throw new Error("Unknown music track");
        const media = this.mediaFactory();
        media.preload = "none";
        media.loop = true;
        const source = this.context.createMediaElementSource(media);
        const gain = this.context.createGain();
        gain.gain.value = 0;
        source.connect(gain);
        gain.connect(this.master);
        const stream: Voice = { media, source, gain, trackId, stopping: false };
        this.voices.add(stream);
        this.pending = voice = stream;
        media.onwaiting = () => {
          if (!this.hidden && (this.current === stream || this.pending === stream)) {
            this.loading = true;
            this.notify();
          }
        };
        media.onplaying = () => {
          if (this.current === stream && !this.pending) {
            this.loading = false;
            this.notify();
          }
        };
        media.onerror = () => {
          if (!stream.stopping && (this.current === stream || this.pending === stream)) this.fail(media.error);
        };
        media.src = new URL(`../../assets/music/${track.file}`, import.meta.url).href;
      }
      // play() resolves once playback starts, without waiting for the full MP3.
      await voice.media.play();
      if (request !== this.request || !this.settings.enabled || this.hidden) return;
      if (voice !== this.current) {
        const now = this.context.currentTime;
        voice.gain.gain.setValueAtTime(0, now);
        voice.gain.gain.linearRampToValueAtTime(1, now + 1.8);
        this.stopAll(1.8, voice);
      }
      this.loading = false;
      this.notify();
    } catch (error) {
      if (request !== this.request) return;
      if (error instanceof Error && error.name === "NotAllowedError") {
        this.request++;
        this.unlocked = false;
        this.loading = false;
        this.stopAll(0);
        this.notify();
      } else this.fail(error);
    }
  }

  releaseVoice(voice: Voice) {
    voice.stopping = true;
    clearTimeout(voice.timer);
    voice.media.onwaiting = voice.media.onplaying = voice.media.onerror = null;
    voice.media.pause();
    voice.media.removeAttribute("src");
    voice.media.load();
    voice.source.disconnect();
    voice.gain.disconnect();
    this.voices.delete(voice);
    if (this.pending === voice) this.pending = null;
    if (this.current === voice) this.current = null;
  }

  stopAll(duration: number, keep?: Voice) {
    const now = this.context?.currentTime || 0;
    for (const voice of this.voices) {
      if (voice === keep) continue;
      if (duration === 0 || voice === this.pending || voice.media.paused) {
        this.releaseVoice(voice);
        continue;
      }
      if (voice.stopping) continue;
      voice.stopping = true;
      // Hold the actual value if supported; otherwise avoid a sudden gain jump.
      if (voice.gain.gain.cancelAndHoldAtTime) voice.gain.gain.cancelAndHoldAtTime(now);
      else voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.linearRampToValueAtTime(0, now + duration);
      voice.timer = setTimeout(() => this.releaseVoice(voice), (duration + 0.02) * 1000);
    }
    this.current = keep || null;
    this.pending = null;
  }

  fail(error: unknown) {
    this.request++;
    this.loading = false;
    this.error = "音乐暂时无法播放，请重试。";
    this.stopAll(0.2);
    this.notify();
    this.onError(this.error, error);
  }
}
