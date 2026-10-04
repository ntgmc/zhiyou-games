import { GameAudio as Player, normalizeAudioSettings as normalize, type AudioOptions, type Scene } from "../../shared/audio.js";
export type { AudioState } from "../../shared/audio.js";

export const MUSIC_TRACKS = [
  { id: "orbit", title: "轨道晨光", description: "缓慢的合成器长音，适合开场和航行。", scene: "剧情 · 航行", file: "orbit.mp3" },
  { id: "code", title: "码间微光", description: "轻柔、规律的琶音，解题时可以循环听。", scene: "学习 · 解题", file: "code.mp3" },
  { id: "storm", title: "风暴边界", description: "低频脉冲带来一点紧张感，伴随有干扰的任务。", scene: "干扰 · 调度", file: "storm.mp3" },
  { id: "arrival", title: "远方回声", description: "温暖的和声与铃音，在任务完成后响起。", scene: "回信 · 完成", file: "arrival.mp3" },
];

// Follow the chapter's phase, never temporary tools or sending animations.
export function sceneTrack({ missionId = 1, intro = false, status = "playing" }: Scene = {}): string {
  if (status === "won") return "arrival";
  if (intro) return "orbit";
  if (status === "lost" || missionId >= 4) return "storm";
  return "code";
}

export function normalizeAudioSettings(value: Parameters<typeof normalize>[0] = {}) {
  return normalize(value, MUSIC_TRACKS);
}

export class GameAudio extends Player {
  constructor(options: Omit<AudioOptions, "tracks" | "selectTrack"> = {}) {
    super({ storageKey: "deep-space-comms-audio", ...options, tracks: MUSIC_TRACKS, selectTrack: sceneTrack });
  }
}
