import logging
import numpy as np
import pretty_midi

logger = logging.getLogger('uvicorn.error')


def preprocess(samples):
    # One constant gain for the entire recording, not per-chunk normalization.
    # No gate, denoiser, compressor, pitch change or transient smoothing.
    peak = float(np.max(np.abs(samples)))
    gain = min(4.0, 0.95 / peak) if peak > 0 else 1.0
    return (samples * gain).astype(np.float32)


def postprocess(midi, evidence, duration):
    metrics = {'notes_before_postprocessing': sum(len(t.notes) for t in midi.instruments),
               'duplicate_notes_removed': 0, 'fragmented_notes_merged': 0,
               'boundary_notes_recovered': 0, 'notes_after_postprocessing': 0,
               'estimated_duration': duration}
    by_pitch = {}
    for e in evidence:
        if e['end'] > e['start']:
            by_pitch.setdefault(e['pitch'], []).append(e)
    for track in midi.instruments:
        grouped = {}
        for n in track.notes:
            grouped.setdefault(n.pitch, []).append(n)
        # Only recover uncovered intervals explicitly predicted in overlap context.
        for pitch, observations in by_pitch.items():
            notes = grouped.setdefault(pitch, [])
            for e in sorted(observations, key=lambda v: (v['start'], v['end'])):
                boundaries = [b for b in range(8, int(duration) + 1, 8)
                              if e['start'] < b + 1 and e['end'] > b - 1]
                if not boundaries:
                    continue
                owner_start = e['chunk'] * 8.0
                owner_end = min(duration, owner_start + 8)
                pieces = [(e['start'], min(e['end'], owner_start)),
                          (max(e['start'], owner_end), e['end'])]
                for start, end in pieces:
                    if end <= start:
                        continue
                    # Existing same-pitch observations own their intervals. Do not
                    # overwrite attacks; add only uncovered evidence segments.
                    uncovered = [(start, end)]
                    for n in notes:
                        remaining = []
                        for a, b in uncovered:
                            if n.end <= a or n.start >= b:
                                remaining.append((a, b))
                            else:
                                if a < n.start:
                                    remaining.append((a, n.start))
                                if n.end < b:
                                    remaining.append((n.end, b))
                        uncovered = remaining
                    for a, b in uncovered:
                        if b - a >= .02:
                            notes.append(pretty_midi.Note(e['velocity'], pitch, a, b))
                            metrics['boundary_notes_recovered'] += 1
            grouped[pitch] = notes
        result = []
        for pitch, notes in grouped.items():
            cleaned = []
            for n in sorted(notes, key=lambda x: (x.start, x.end)):
                if n.end <= n.start:
                    continue
                last = cleaned[-1] if cleaned else None
                if last and abs(n.start-last.start) <= .012 and abs(n.end-last.end) <= .02:
                    last.velocity = max(last.velocity, n.velocity)
                    metrics['duplicate_notes_removed'] += 1
                    continue
                if last:
                    gap = n.start-last.end
                    short = min(last.end-last.start, n.end-n.start) <= .15
                    observations = by_pitch.get(pitch, [])
                    spanning = any(e['start'] <= last.end-.025 and e['end'] >= n.start+.025 for e in observations)
                    attack = any(abs(e['start']-n.start) <= .025 for e in observations)
                    # Timing proximity alone is NOT enough: sustained evidence is
                    # required and any observed new attack protects repeated notes.
                    if -.012 <= gap <= .045 and short and spanning and not attack:
                        last.end = max(last.end, n.end)
                        metrics['fragmented_notes_merged'] += 1
                        continue
                cleaned.append(n)
            result.extend(cleaned)
        track.notes = sorted(result, key=lambda n: (n.start, n.pitch, n.end))
    metrics['notes_after_postprocessing'] = sum(len(t.notes) for t in midi.instruments)
    logger.debug('Transcription Engine v2 metrics: %s', metrics)
    return midi
