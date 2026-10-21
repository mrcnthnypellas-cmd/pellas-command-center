"""Re-creates assets/voice/welcome-{female,male}.mp3 ("Welcome, George").

Voices are synthesized offline with Kokoro-82M (Apache-2.0), using:
  pip install kokoro-onnx soundfile        # runtime, phonemizer, vocab
  npm pack kokoro-q8-shards@1.0.0          # model_quantized.onnx in 6 parts
                                           # (joined sha256 fbae9257…a1478)
  npm pack kokoro-local-runtime@0.1.0      # voices/af_heart.bin, am_michael.bin
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
VOICES = {'female': 'af_heart', 'male': 'am_michael'}
OUT = Path(__file__).resolve().parent.parent / 'assets' / 'voice'


def main(src):
    src = Path(src)
    packed = {v: np.fromfile(src / 'voices' / f'{v}.bin', dtype=np.float32).reshape(-1, 1, 256) for v in VOICES.values()}
    np.savez(src / 'voices.npz', **packed)
    tts = Kokoro(str(src / 'model_quantized.onnx'), str(src / 'voices.npz'))
    OUT.mkdir(parents=True, exist_ok=True)
    for name, voice in VOICES.items():
        samples, rate = tts.create(TEXT, voice=voice, speed=0.9, lang='en-us')
        wav = src / f'welcome-{name}.wav'
        sf.write(wav, samples, rate)
        subprocess.run([
            'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wav),
            '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,'
                   'silenceremove=start_periods=1:start_threshold=-45dB,areverse,'
                   'apad=pad_dur=0.25,loudnorm=I=-16:TP=-1.5:LRA=11',
            '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '48k', str(OUT / f'welcome-{name}.mp3'),
        ], check=True)
        print(f'wrote {OUT / f"welcome-{name}.mp3"}')


if __name__ == '__main__':
    main(sys.argv[1])
