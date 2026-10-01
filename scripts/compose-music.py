"""Render the game's four original, circular ambient compositions.

Development-only requirements: Python, numpy, and ffmpeg (or imageio-ffmpeg).
The committed MP3 files are sufficient to build and play the game.
"""

from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import wave

import numpy as np

RATE = 44100
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "music"

PI = np.pi

SCORES = [
    {
        "id": "orbit",
        "title": "轨道晨光",
        "bpm": 72,
        "chords": [[50, 57, 61, 66, 69], [47, 54, 57, 61, 66],
                   [43, 50, 57, 59, 66], [45, 52, 57, 61, 64]],
        "melody": [78, 76, 73, 69, 73, 76, 78, 81],
        "arp": [1, 2, 3, 2, 4, 2, 3, 1],
        "density": 2,
        "color": 0.22,
    },
    {
        "id": "code",
        "title": "码间微光",
        "bpm": 80,
        "chords": [[48, 55, 59, 62, 67], [45, 52, 55, 59, 64],
                   [41, 48, 52, 55, 60], [43, 50, 55, 57, 62]],
        "melody": [79, 74, 76, 71, 72, 76, 74, 67],
        "arp": [1, 3, 2, 4, 2, 3, 1, 2],
        "density": 1,
        "color": 0.32,
    },
    {
        "id": "storm",
        "title": "风暴边界",
        "bpm": 92,
        "chords": [[45, 52, 57, 60, 64], [41, 48, 55, 57, 60],
                   [48, 55, 60, 62, 67], [43, 50, 57, 59, 62]],
        "melody": [76, 72, 71, 69, 67, 71, 74, 72],
        "arp": [1, 2, 1, 3, 1, 2, 4, 2],
        "density": 0.5,
        "color": 0.18,
    },
    {
        "id": "arrival",
        "title": "远方回声",
        "bpm": 68,
        "chords": [[48, 55, 60, 64, 71], [43, 50, 55, 59, 62],
                   [45, 52, 57, 60, 64], [41, 48, 55, 60, 64]],
        "melody": [76, 79, 83, 81, 79, 76, 74, 72],
        "arp": [1, 2, 3, 4, 3, 2, 4, 2],
        "density": 2,
        "color": 0.28,
    },
]


def frequency(midi):
    return 440 * 2 ** ((midi - 69) / 12)


def add_voice(mix, start, duration, midi, amplitude, pan, voice, color=0.25):
    """Wrap each event and its release around the loop boundary."""
    length = int(duration * RATE)
    time = np.arange(length) / RATE
    freq = frequency(midi)
    if voice == "pad":
        attack = np.minimum(time / 1.7, 1)
        release = np.minimum((duration - time) / 2.6, 1)
        envelope = np.sin(PI / 2 * np.maximum(0, attack * release)) ** 2
        # Slow detuning and very quiet upper partials keep the pads soft.
        phase = 2 * PI * freq * time
        signal = (np.sin(phase + 0.25 * np.sin(2 * PI * 0.16 * time))
                  + 0.36 * np.sin(2 * PI * freq * 1.0015 * time)
                  + color * np.sin(phase * 2)
                  + 0.07 * np.sin(phase * 3)) / 1.55
    elif voice == "bell":
        envelope = (1 - np.exp(-time * 55)) * np.exp(-time * 1.8)
        envelope *= np.minimum((duration - time) / 0.2, 1)
        signal = (np.sin(2 * PI * freq * time)
                  + 0.18 * np.sin(2 * PI * freq * 2 * time) * np.exp(-time * 3)
                  + 0.05 * np.sin(2 * PI * freq * 3 * time)) / 1.23
    else:
        envelope = (1 - np.exp(-time * 12)) * np.exp(-time * 2.4)
        envelope *= np.minimum((duration - time) / 0.2, 1)
        signal = np.sin(2 * PI * freq * time)
    signal = (signal * envelope * amplitude).astype(np.float32)
    indices = (np.arange(length) + int(start * RATE)) % len(mix)
    mix[indices, 0] += signal * np.cos((pan + 1) * PI / 4)
    mix[indices, 1] += signal * np.sin((pan + 1) * PI / 4)


def render(score):
    beat = 60 / score["bpm"]
    duration = beat * 64
    mix = np.zeros((round(duration * RATE), 2), dtype=np.float32)
    for section in range(4):
        chord = score["chords"][section]
        start = section * 16 * beat
        for i, midi in enumerate(chord):
            add_voice(mix, start, 16 * beat + 2.6, midi,
                      0.105 if i else 0.075, (i - 2) * 0.28, "pad", score["color"])
        for pulse in np.arange(0, 16, score["density"]):
            slot = int(pulse / score["density"])
            midi = chord[score["arp"][slot % 8]] + 12
            add_voice(mix, start + pulse * beat, 3.1, midi,
                      0.042 if score["id"] == "storm" else 0.052,
                      np.sin(slot * 1.7) * 0.5, "bell")
        for j, position in enumerate([1, 7]):
            midi = score["melody"][section * 2 + j]
            add_voice(mix, start + position * beat, 4.5, midi, 0.084,
                      (-0.18 if j == 0 else 0.2), "bell")
        if score["id"] in ("code", "storm"):
            for pulse in range(0, 16, 2):
                add_voice(mix, start + pulse * beat, 1.6, chord[0] - 12,
                          0.09 if score["id"] == "storm" else 0.048, 0, "pulse")
    # Circular stereo echoes preserve tails at the join, without a silent gap.
    dry = mix.copy()
    for delay, level in [(0.193, 0.19), (0.379, 0.14), (0.617, 0.1), (1.013, 0.06)]:
        mix += np.roll(dry[:, ::-1], round(delay * RATE), axis=0) * level
    mix -= np.mean(mix, axis=0)
    mix *= 0.66 / max(float(np.max(np.abs(mix))), 0.01)
    return mix, duration


def encoder():
    executable = os.environ.get("FFMPEG") or shutil.which("ffmpeg")
    if executable:
        return executable
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError as error:
        raise SystemExit("Install ffmpeg or set FFMPEG to its executable path.") from error


def main():
    ffmpeg = encoder()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="deep-space-score-") as temporary:
        for score in SCORES:
            mix, duration = render(score)
            wav_path = Path(temporary) / f"{score['id']}.wav"
            with wave.open(str(wav_path), "wb") as audio:
                audio.setnchannels(2)
                audio.setsampwidth(2)
                audio.setframerate(RATE)
                audio.writeframes((mix * 32767).astype("<i2").tobytes())
            target = OUTPUT / f"{score['id']}.mp3"
            subprocess.run([
                ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav_path),
                "-codec:a", "libmp3lame", "-b:a", "112k",
                "-metadata", f"title={score['title']}",
                "-metadata", "artist=Deep Space Comms Original Score",
                "-metadata", "comment=Original synthesized composition; no sampled recordings.",
                str(target),
            ], check=True)
            rms = float(np.sqrt(np.mean(mix ** 2)))
            print(f"{target.name}: {duration:.2f}s, {target.stat().st_size:,} bytes, RMS {rms:.3f}")


if __name__ == "__main__":
    main()
