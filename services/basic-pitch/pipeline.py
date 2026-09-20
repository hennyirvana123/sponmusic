import os
import subprocess
import numpy as np
import soundfile as sf
import librosa
from chunked import transcribe_chunks


def process(path, directory, model):
    normalized = os.path.join(directory, 'input.wav')
    try:
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', path, '-t', '61', '-vn', '-ac', '1', '-ar', '22050', '-y', normalized], check=True, capture_output=True, timeout=30)
        samples, sr = sf.read(normalized, dtype='float32')
    except subprocess.TimeoutExpired:
        raise ValueError('Audio decoding timed out')
    except (subprocess.CalledProcessError, RuntimeError):
        raise ValueError('Audio could not be decoded')
    if len(samples) > sr * 60:
        raise ValueError('Maximum duration is 60 seconds')
    if len(samples) < sr / 4 or not np.isfinite(samples).all() or np.max(np.abs(samples)) < .0001:
        raise ValueError('Audio is too short, silent or invalid')
    bpm = 120.0
    tempo, _ = librosa.beat.beat_track(y=samples, sr=sr)
    estimate = float(np.asarray(tempo).reshape(-1)[0])
    if np.isfinite(estimate) and estimate > 0:
        bpm = max(40, min(240, estimate))
    midi = transcribe_chunks(samples, sr, model, directory, bpm)
    if not any(t.notes for t in midi.instruments):
        raise ValueError('Basic Pitch detected no notes')
    output = os.path.join(directory, 'transcription.mid')
    midi.write(output)
    with open(output, 'rb') as f:
        data = f.read(2_000_001)
    if len(data) > 2_000_000 or not data.startswith(b'MThd'):
        raise ValueError('Invalid or oversized MIDI output')
    return data, bpm
