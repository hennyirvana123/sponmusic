import json
import logging
import os
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit

import librosa
import numpy as np
import pretty_midi
import soundfile as sf

log = logging.getLogger('uvicorn.error')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Separation redirects are not allowed')


def fetch_stems(path, directory, base):
    parsed = urlsplit(base)
    if parsed.scheme not in ('http', 'https') or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('Invalid SOURCE_SEPARATION_URL')
    base = base.rstrip('/')
    opener = urllib.request.build_opener(NoRedirect())
    deadline = time.monotonic() + 1800

    def request(route, data=None, content_type=None, limit=65536):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise ValueError('Source separation timed out after 1800 seconds')
        req = urllib.request.Request(base + route, data=data)
        if content_type:
            req.add_header('Content-Type', content_type)
        try:
            with opener.open(req, timeout=min(60, remaining)) as response:
                body = response.read(limit + 1)
                if len(body) > limit:
                    raise ValueError('Separation response exceeds size limit')
                return body
        except urllib.error.URLError as exc:
            raise ValueError('Source separation HTTP/network failure; check service logs and URL') from exc

    diagnostics = json.loads(request('/diagnostics'))
    if diagnostics.get('engine') != 'demucs' or diagnostics.get('model') != 'htdemucs' or diagnostics.get('modelAvailable') is not True:
        raise ValueError('Demucs htdemucs is not ready')
    import uuid
    boundary = uuid.uuid4().hex
    with open(path, 'rb') as source:
        audio = source.read(20_000_001)
    if len(audio) > 20_000_000:
        raise ValueError('Separation input exceeds 20 MB')
    payload = (f'--{boundary}\r\nContent-Disposition: form-data; name="audio"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\n'.encode()
               + audio + f'\r\n--{boundary}--\r\n'.encode())
    job = json.loads(request('/separate', payload, f'multipart/form-data; boundary={boundary}'))
    key = job.get('job_id', '')
    if len(key) != 32 or any(c not in '0123456789abcdef' for c in key):
        raise ValueError('Invalid separation job ID')
    while True:
        state = json.loads(request('/separate/' + key))
        if state.get('status') == 'completed':
            break
        if state.get('status') == 'failed':
            raise ValueError('Demucs separation failed; inspect separation service logs')
        if state.get('status') not in ('queued', 'processing'):
            raise ValueError('Invalid separation job status')
        time.sleep(3)
    stems = {}
    for name in ('vocals', 'instrumental'):
        data = request(f'/separate/{key}/{name}', limit=50_000_000)
        target = os.path.join(directory, name + '.wav')
        with open(target, 'wb') as output:
            output.write(data)
        samples, sr = sf.read(target, dtype='float32', always_2d=True)
        if not len(samples) or not np.isfinite(samples).all() or len(samples) > sr * 60.1:
            raise ValueError('Invalid separated audio')
        stems[name] = librosa.resample(samples.mean(axis=1), orig_sr=sr, target_sr=22050)
    log.info('Demucs htdemucs job completed; decoded vocal and non-vocal stems')
    return stems


def vocal_melody(samples, bpm):
    # pYIN is a monophonic probabilistic pitch tracker, not a full-mix model.
    sr, hop = 22050, 256
    track = pretty_midi.Instrument(program=0, name='Separated vocal melody')
    if np.max(np.abs(samples)) < .0001:
        return track
    for start in range(0, len(samples), sr * 8):
        end = min(len(samples), start + sr * 8)
        left, right = max(0, start - sr), min(len(samples), end + sr)
        clip = samples[left:right]
        f0, voiced, probability = librosa.pyin(clip, fmin=65.4, fmax=1046.5, sr=sr, frame_length=2048, hop_length=hop)
        rms = librosa.feature.rms(y=clip, frame_length=2048, hop_length=hop)[0]
        floor = max(.0005, float(np.max(rms)) * .035)
        active = None
        for i in range(len(f0)):
            t = (left + i * hop) / sr
            if t < start / sr or t >= end / sr:
                continue
            valid = voiced[i] and probability[i] >= .65 and rms[i] >= floor and np.isfinite(f0[i])
            pitch = int(round(librosa.hz_to_midi(f0[i]))) if valid else None
            stop = min(end / sr, t + hop / sr)
            if active is not None and pitch == active.pitch:
                active.end = stop
            else:
                if active is not None and active.end - active.start >= .09:
                    track.notes.append(active)
                active = pretty_midi.Note(90, pitch, t, stop) if pitch is not None else None
        if active is not None and active.end - active.start >= .09:
            track.notes.append(active)
    merged = []
    for note in track.notes:
        if merged and merged[-1].pitch == note.pitch and 0 <= note.start - merged[-1].end <= .035:
            merged[-1].end = note.end
        else:
            merged.append(note)
    track.notes = merged
    log.info('pYIN vocal analysis complete: %d voiced notes', len(merged))
    return track
