"""Re-creates assets/voice/welcome-{female,male,bading}.mp3 ("Welcome, George").

Voices are synthesized offline with Kokoro-82M (Apache-2.0), using:
  pip install kokoro-onnx soundfile        # runtime, phonemizer, vocab
  npm pack kokoro-q8-shards@1.0.0          # model_quantized.onnx in 6 parts
                                           # (joined sha256 fbae9257…a1478)
  npm pack kokoro-local-runtime@0.1.0      # voices/af_heart, am_michael, am_liam, af_bella .bin
and ffmpeg (libmp3lame) for trimming, loudness normalisation and MP3 encoding.

Usage: python3 tools/make_voice.py <dir with model_quantized.onnx and voices/>
"""
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

TEXT = 'Welcome, George!'
# Each voice: (style mix, speed, pitch factor). "bading" blends a male and a female
# style with lively intonation, then lifts the pitch about 1.6 semitones.
VOICES = {
    'female': ({'af_heart': 1.0}, 0.9, 1.0),
    'male': ({'am_michael': 1.0}, 0.9, 1.0),
    'bading': ({'am_liam': 0.45, 'af_bella': 0.55}, 0.85, 1.1),
}
OUT = Path(__file__).resolve().parent.parent / 'assets' / 'voice'


def main(src):
    src = Path(src)
    load = lambda n: np.fromfile(src / 'voices' / f'{n}.bin', dtype=np.float32).reshape(-1, 1, 256)
    np.savez(src / 'voices.npz', **{name: sum(load(n) * w for n, w in mix.items()) for name, (mix, _, _) in VOICES.items()})
    tts = Kokoro(str(src / 'model_quantized.onnx'), str(src / 'voices.npz'))
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (_, speed, pitch) in VOICES.items():
        samples, rate = tts.create(TEXT, voice=name, speed=speed, lang='en-us')
        wav = src / f'welcome-{name}.wav'
        sf.write(wav, samples, rate)
        subprocess.run([
            'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wav),
            '-af', (f'asetrate=24000*{pitch},aresample=24000,atempo={1.04 / pitch},' if pitch != 1 else '') +
                   'silenceremove=start_periods=1:start_threshold=-45dB,areverse,'
                   'silenceremove=start_periods=1:start_threshold=-45dB,areverse,'
                   'apad=pad_dur=0.25,loudnorm=I=-16:TP=-1.5:LRA=11',
            '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '48k', str(OUT / f'welcome-{name}.mp3'),
        ], check=True)
        print(f'wrote {OUT / f"welcome-{name}.mp3"}')


if __name__ == '__main__':
    main(sys.argv[1])
