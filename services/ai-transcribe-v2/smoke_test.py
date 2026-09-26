"""Explicit real-model smoke test; never executed during image build or startup."""
import math
import os
import struct
import tempfile
import time
import wave
from pathlib import Path


def write_test_wav(path):
    sample_rate = 44100
    seconds = 6
    chords = ((60,), (64,), (67,), (60, 64, 67), (62, 65, 69), (60, 64, 67))
    frames = bytearray()
    for index in range(sample_rate * seconds):
        t = index / sample_rate
        local = t % 1.0
        notes = chords[int(t)]
        envelope = min(local / 0.02, 1.0) * max(0.0, min((0.9 - local) / 0.1, 1.0))
        value = sum(math.sin(2 * math.pi * 440 * 2 ** ((note - 69) / 12) * local)
                    for note in notes) / len(notes)
        frames.extend(struct.pack('<h', round(0.3 * envelope * value * 32767)))
    with wave.open(str(path), 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(frames)


def main():
    print('YOURMT3 SMOKE TEST\nMODEL=yourmt3\nDEVICE=cpu', flush=True)
    status = {'MODEL_LOAD': 'NOT RUN', 'INFERENCE': 'NOT RUN', 'MIDI_OUTPUT': 'NOT RUN'}
    stage = None
    try:
        os.environ.setdefault('MT3_CHECKPOINT_DIR', '/models/mt3')
        from mt3_infer import load_model
        from mt3_infer.utils.audio import load_audio
        import mido

        with tempfile.TemporaryDirectory(prefix='yourmt3-smoke-') as directory:
            source = Path(directory) / 'input.wav'
            output = Path(directory) / 'output.mid'
            write_test_wav(source)
            stage = 'MODEL_LOAD'
            started = time.perf_counter()
            try:
                model = load_model('yourmt3', device='cpu')
            finally:
                print(f'MODEL_LOAD_SECONDS={time.perf_counter() - started:.6f}', flush=True)
            if model is None:
                raise RuntimeError('load_model returned None')
            status[stage] = 'PASS'
            stage = None
            audio, sr = load_audio(str(source))
            if sr <= 0 or len(audio) == 0:
                raise ValueError('Audio loader returned empty audio or invalid sample rate')
            print(f'INPUT_DURATION={len(audio) / sr:.6f}\nSAMPLE_RATE={sr}', flush=True)
            stage = 'INFERENCE'
            started = time.perf_counter()
            try:
                midi = model.transcribe(audio, sr=sr)
            finally:
                print(f'INFERENCE_SECONDS={time.perf_counter() - started:.6f}', flush=True)
            if midi is None:
                raise RuntimeError('transcribe returned None')
            status[stage] = 'PASS'
            stage = 'MIDI_OUTPUT'
            midi.save(str(output))
            size = output.stat().st_size
            if size <= 0:
                raise ValueError('Model output MIDI is empty')
            parsed = mido.MidiFile(str(output))
            notes = sum(message.type == 'note_on' and message.velocity > 0
                        for track in parsed.tracks for message in track)
            duration = parsed.length
            print(f'MIDI_TRACKS={len(parsed.tracks)}\nMIDI_NOTES={notes}\n'
                  f'MIDI_DURATION={duration:.6f}\nMIDI_SIZE_BYTES={size}', flush=True)
            if not notes:
                raise ValueError('Model MIDI contains no positive-velocity note_on events')
            status[stage] = 'PASS'
    except Exception:
        if stage is not None:
            status[stage] = 'FAIL'
        print('SMOKE_TEST=FAIL', flush=True)
        raise
    finally:
        for key, value in status.items():
            print(f'{key}={value}', flush=True)


if __name__ == '__main__':
    main()
