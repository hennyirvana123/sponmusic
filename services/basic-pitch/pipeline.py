import os
import subprocess
import numpy as np
import soundfile as sf
import librosa
from chunked import transcribe_chunks
from transcription_quality import preprocess, postprocess


def process(path, directory, model):
    normalized = os.path.join(directory, 'input.wav')
    try:
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', path, '-t', '61', '-vn', '-ac', '1', '-ar', '22050', '-y', normalized], check=True, capture_output=True, timeout=30)
        samples, sr = sf.read(normalized, dtype='float32')
    except subprocess.TimeoutExpired as exc:
        raise ValueError('Audio decode stage timed out after 30 seconds') from exc
    except Exception as exc:
        raise ValueError('Audio decode stage failed: invalid audio or decoder unavailable') from exc
    if len(samples) > sr * 60:
        raise ValueError('Maximum duration is 60 seconds')
    if len(samples) < sr / 4 or not np.isfinite(samples).all() or np.max(np.abs(samples)) < .0001:
        raise ValueError('Audio is too short, silent or invalid')
    samples = preprocess(samples)
    try:
        tempo, _ = librosa.beat.beat_track(y=samples, sr=sr)
        estimate = float(np.asarray(tempo).reshape(-1)[0])
        if not np.isfinite(estimate) or estimate <= 0:
            raise ValueError('No reliable tempo detected')
        bpm = max(40, min(240, estimate))
    except Exception as exc:
        raise ValueError('Tempo/BPM estimation stage failed; no MIDI generated') from exc
    separation_url = os.environ.get('SOURCE_SEPARATION_URL', '').strip()
    stems = None
    if separation_url:
        from stem_analysis import fetch_stems
        stems = fetch_stems(normalized, directory, separation_url)
        for stem in stems.values():
            if abs(len(stem) - len(samples)) > sr * .1:
                raise ValueError('Separation output duration does not match input')
    evidence = []
    analysis_audio = preprocess(stems['instrumental']) if stems is not None else samples
    midi = transcribe_chunks(analysis_audio, sr, model, directory, bpm, evidence=evidence)
    try:
        midi = postprocess(midi, evidence, len(samples) / sr)
    except Exception as exc:
        raise ValueError('Transcription post-processing failed; no MIDI returned') from exc
    if stems is not None:
        from stem_analysis import vocal_melody
        import pretty_midi
        harmony = pretty_midi.Instrument(program=0, name='Separated instrumental harmony')
        bass = pretty_midi.Instrument(program=0, name='Separated instrumental bass candidates')
        for track in midi.instruments:
            for note in track.notes:
                (bass if note.pitch < 48 else harmony).notes.append(note)
        lead = vocal_melody(stems['vocals'], bpm)
        midi.instruments = [track for track in (lead, harmony, bass) if track.notes]
    if not any(t.notes for t in midi.instruments):
        raise ValueError('Basic Pitch detected no notes')
    output = os.path.join(directory, 'transcription.mid')
    try:
        midi.write(output)
        with open(output, 'rb') as f:
            data = f.read(2_000_001)
    except Exception as exc:
        raise ValueError('MIDI write/read stage failed; no result available') from exc
    if len(data) > 2_000_000 or not data.startswith(b'MThd'):
        raise ValueError('MIDI validation stage failed: invalid or oversized result')
    return data, bpm
