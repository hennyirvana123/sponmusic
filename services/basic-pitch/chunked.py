import logging
import math
import os
import time

import pretty_midi
import soundfile as sf
from basic_pitch.inference import predict

logger = logging.getLogger('uvicorn.error')


def transcribe_chunks(samples, sr, model, directory, bpm, evidence=None):
    # Eight-second ownership regions with one second of context on either side.
    # Inference windows are at most ten seconds; context is not duplicated in output.
    duration = len(samples) / sr
    count = math.ceil(duration / 8.0)
    output = pretty_midi.PrettyMIDI(initial_tempo=bpm, resolution=960)
    instrument = pretty_midi.Instrument(program=0, name='Basic Pitch transcription')
    previous_tails = {}
    for index in range(count):
        core_start = index * 8.0
        core_end = min(duration, core_start + 8.0)
        first = max(0, round((core_start - 1.0) * sr))
        last = min(len(samples), round((core_end + 1.0) * sr))
        offset = first / sr
        path = os.path.join(directory, f'chunk-{index}.wav')
        started = time.monotonic()
        try:
            sf.write(path, samples[first:last], sr)
            _, midi, _ = predict(path, model)
            candidates = []
            for track in midi.instruments:
                for note in track.notes:
                    start, end = note.start + offset, note.end + offset
                    if not (math.isfinite(start) and math.isfinite(end)):
                        raise ValueError('Non-finite note timing')
                    if evidence is not None and end > start:
                        evidence.append({'pitch': note.pitch, 'start': max(0, start), 'end': min(duration, end), 'velocity': note.velocity, 'chunk': index})
                    if end <= core_start or start >= core_end:
                        continue
                    candidates.append((note.pitch, start, end, note.velocity))
            tails = {}
            # Clip to ownership boundaries, stitching only notes detected as crossing
            # the boundary in BOTH windows. Repeated onsets inside a region stay separate.
            for pitch, start, end, velocity in sorted(candidates, key=lambda n: (n[1], n[0])):
                left, right = max(start, core_start), min(end, core_end)
                if right <= left:
                    continue
                prior = previous_tails.pop(pitch, None) if start < core_start - .02 else None
                if prior is not None and abs(prior.end - core_start) < .001:
                    prior.end = right
                    merged = prior
                else:
                    merged = pretty_midi.Note(velocity=velocity, pitch=pitch, start=left, end=right)
                    instrument.notes.append(merged)
                if end > core_end + .02:
                    tails[pitch] = merged
            previous_tails = tails
            logger.info('Basic Pitch chunk %d/%d complete in %.2fs', index + 1, count, time.monotonic() - started)
        except Exception as exc:
            logger.exception('Basic Pitch chunk %d/%d failed', index + 1, count)
            raise RuntimeError(f'Basic Pitch chunk {index + 1}/{count} failed; no partial MIDI returned') from exc
        finally:
            if os.path.exists(path):
                os.remove(path)
    instrument.notes.sort(key=lambda n: (n.start, n.pitch, n.end))
    output.instruments.append(instrument)
    return output
